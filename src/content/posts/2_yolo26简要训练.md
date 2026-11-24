---
title: 'YOLO26 的简要训练过程'
description: '从 uv 环境、手势数据集、训练参数，到 NCNN 导出与 INT8 量化：把 YOLO26n 压到 2.46MB 的完整记录，以及踩过的坑。'
published: 2026-11-24
category: 技术
tags: ['YOLO', '深度学习', '模型量化']
cover: /covers/yolo26.jpg
coverAlt: '深色网格背景上的 YOLO26 检测框与标题'
pinned: true
---

本文主要写一下关于 YOLO26 训练和部分量化的过程。

目标不是刷指标，而是把模型压到一块龙芯 2K0300 上（LA264 单核，没有 LSX/LASX），验证「训练 → 导出 → 量化 → 推理」这条链路能不能跑通。模型选了 YOLO26n，任务是 10 类手势检测，输入 640×640。

## 环境和硬件

训练在 x86 开发机上完成，部署目标是另一块板子。所以下文的速度数据只在 x86 上有意义，不能直接换算成板端帧率。

| 项目 | 配置 |
| --- | --- |
| CPU | Intel i5-12400F（6 核 12 线程） |
| 内存 | 16GB |
| 硬盘 | 2TB NVMe，训练时可用约 1.1TB |
| 显卡 | NVIDIA RTX 3060 12GB |
| 系统 | Arch Linux |
| Python | 3.11（`.python-version`） |
| Ultralytics | 8.4.193 |
| PyTorch | 2.15.0+cu132 |

显卡驱动要先装好。Arch 下装 `nvidia`、`nvidia-utils`（或者 `nvidia-open`），重启后 `nvidia-smi` 能看到卡再开始。CUDA 运行时由 PyTorch 的 wheel 自带，不需要额外装 CUDA Toolkit。

## 安装虚拟环境

用 uv 管依赖，省得和系统 Python 打架：

```bash
# 初始化一个文件夹
uv init yolo26
cd yolo26
uv add ultralytics
```

之后所有脚本都用 `uv run` 跑，它会自动使用项目里的 `.venv`：

```bash
uv run main.py
```

### 导出依赖是自动装的，但别被 `uv sync` 坑了

第一次导出 ONNX / NCNN 时，Ultralytics 会自己装缺的包，日志里能看到：

```text
requirements: Ultralytics requirements ['onnx>=1.12.0,<2.0.0', ...] not found, attempting AutoUpdate...
AutoUpdate success ✅
```

这些包**不在** `pyproject.toml` 和 `uv.lock` 里。`uv run` 会补装、不会清理；但 `uv sync` 会把它们当成多余依赖卸掉（实测提示 `Would uninstall 9 packages`，onnx、ncnn、pnnx 都在里面）。

所以稳妥的做法是显式写进项目依赖：

```bash
uv add onnx onnxruntime onnxslim ncnn "pnnx==20260526"
```

临时关闭自动安装可以设 `YOLO_AUTOINSTALL=False`，但一般没必要。

## 准备数据集

数据可以下载现成的，也可以用 labelImg / labelme 自己标。格式统一成 YOLO 检测格式：

```text
datasets/<name>/
├── data.yaml
├── images/train/*.png
├── images/val/*.png
├── labels/train/*.txt
└── labels/val/*.txt
```

图像和标签必须**一一对应且同名**（`images/train/a.png` ↔ `labels/train/a.txt`），标签每行是 `类别ID 中心x 中心y 宽 高`，坐标都归一化到 0~1。

手势数据集是 10 类、1200 张训练 / 200 张验证，原图 1280×960：

```yaml
path: datasets/hands_gesture
train: images/train
val: images/val

nc: 10
names: [A, 'number 7', D, I, L, V, W, Y, 'I love you', 'number 5']
```

项目里还放了一个 3 类的电池数据集（689 张训练 / 173 张验证），验证换数据集只需要改 `data` 指向。

这里有个很容易踩的格式坑：`names` 必须写成列表或 `{id: name}` 字典。写成无缩进的裸文本会被 YAML 解析成字符串，训练直接报：

```text
TypeError: 'names' must be list or dict, not str
```

## 编写训练参数

入口就一个 `main.py`，参数都在 `model.train()` 里：

```python
from ultralytics import YOLO

model = YOLO("./yolo26n.pt")

model.train(
    data="datasets/hands_gesture/data.yaml",
    epochs=300,      # 总轮次
    imgsz=640,       # 输入尺寸
    batch=32,        # 单卡一次喂 32 张
    workers=8,       # 数据加载线程
    cache="ram",     # 图像解码后常驻内存
    amp=True,        # 混合精度
    val=True,        # 每轮验证，早停依赖它
    patience=50,     # 50 轮不提升就停
    plots=False,     # 不画训练曲线，省时间
    name="train",
)
```

几个参数的实际影响：

| 参数 | 说明 |
| --- | --- |
| `epochs=300` + `patience=50` | 正常不会跑满，指标停滞 50 轮就停 |
| `imgsz=640` | 导出和量化校准都要保持 640，别中途改 |
| `batch=32` | 12GB 显存够用，再大就要看显存 |
| `workers=8` | 6 核 12 线程，设 8 比较合适 |
| `cache="ram"` | 1200 张图解码后约占 4.4GB，内存够就开 |
| `val=True` | 关掉会更快，但早停失效、`best.pt` 不可靠 |
| `plots=False` | 不需要曲线图时关掉 |

关于速度，实测最有效的就是 `cache="ram"`。同样前 4 轮累计耗时：

| 配置 | 4 轮累计 |
| --- | --- |
| 无缓存 + `val=False` | 41.69s |
| `cache="ram"` + `val=False` | 32.76s |
| `cache="ram"` + `val=True` | 33.89s |

缓存省了大约 21%，而每轮验证只多 0.5~0.6s，换来可靠的早停和 `best.pt`，很划算。优化器、学习率这些参数只影响收敛质量，不影响每轮耗时，别指望靠它们提速。

> 小提示：`YOLO("./yolo26n.pt")` 在当前目录找不到时，会去全局 `weights_dir` 找（本项目是 `weights/yolo26n.pt`），再找不到才下载。换目录运行可能触发重新下载，想确定就直接写全路径。

## 目录结构

项目按「训练 / 导出 / 测试」分开，跑起来不容易乱：

```text
yolo26/
├── main.py                        # 训练入口
├── pyproject.toml                 # 依赖声明（uv 管理）
├── weights/
│   └── yolo26n.pt                 # 预训练权重
├── datasets/
│   ├── hands_gesture/             # 手势：10 类，1200/200
│   │   ├── data.yaml
│   │   ├── images/{train,val}
│   │   └── labels/{train,val}
│   └── betterys/                  # 电池：3 类，689/173
│       ├── data.yaml
│       ├── images/{train,val}
│       └── labels/{train,val}
├── export/
│   ├── ncnn/                      # FP32 导出、内置 INT8 导出（未采用）
│   └── onnx/                      # FP32 / INT8 导出
├── test/
│   ├── test_pt.py                 # PyTorch 冒烟
│   ├── test_onnx.py               # ONNX 冒烟
│   ├── test_onnx_compare.py       # ONNX FP32 vs INT8
│   ├── test_ncnn.py               # NCNN 冒烟
│   ├── test_ncnn_int8.py          # NCNN FP32 vs INT8
│   └── ncnn_calib_list.txt        # 200 张校准集路径
└── runs/detect/train/
    ├── args.yaml                  # 本次训练的全部参数
    ├── results.csv                # 每轮指标
    └── weights/
        ├── best.pt                # 最优权重，5.3MB
        ├── best.onnx              # ONNX FP32，9.9MB
        ├── best_int8.onnx         # ONNX INT8，2.9MB
        ├── best_ncnn_model/       # NCNN FP32，9.25MB
        └── best_int8_ncnn_model/  # NCNN INT8，2.46MB
```

## 训练结果

```bash
uv run main.py
```

输出在 `runs/detect/train/`。这次实际在第 66 轮早停，总耗时 453s，约 6.9s/轮：

| 指标 | 第 16 轮（best.pt） | 第 66 轮（last.pt） |
| --- | --- | --- |
| Precision | 0.957 | 0.992 |
| Recall | 0.961 | 0.966 |
| mAP50 | 0.991 | 0.995 |
| mAP50-95 | **0.803** | 0.767 |
| 累计耗时 | 113s | 453s |

`best.pt` 是按 mAP50-95 挑的，所以最后几轮指标回落也正常，部署直接用第 16 轮的权重就行。

换成电池数据集只改 `data=` 一行，`nc` / `names` 会从对应的 `data.yaml` 自动读，不用动代码。

## 导出 ONNX（备用）

部署路线最后选了 NCNN，ONNX 留作对照和桌面端推理。脚本就两行核心逻辑：

```python
model = YOLO("runs/detect/train/weights/best.pt")
model.export(format="onnx", imgsz=640, dynamic=False, simplify=True)
```

INT8 版本加一个 `int8=True`，走 Ultralytics 内置量化。产物规格：

| 项 | 值 |
| --- | --- |
| 体积 | FP32 9.9MB / INT8 2.9MB |
| IR / opset | 8 / 18 |
| 输入 | `images`，`[1, 3, 640, 640]`，FP32，值域 0~1 |
| 输出 | `output0`，`[1, 14, 8400]` |
| 8400 | 80² + 40² + 20² 三个尺度的锚点 |
| 后处理 | 图里没有 NMS，也没有 objectness 分支，需要自己解码 |

`14 = 4(框) + 10(类别)`，所以 `pred[:, 4:]` 取 max 就是类别置信度；前 4 个是 `cx, cy, w, h`，单位是 640 输入下的像素。自己写推理的话，别忘了按原图比例还原并做 NMS；不想写就直接用 `YOLO("best.onnx")` 让 Ultralytics 代劳。

## 导出 NCNN 与 INT8 量化

目标板是 LA264 单核，没有 LSX/LASX 向量扩展，跑 PyTorch 不现实；NCNN 的运行时更轻，也不拖 Python 依赖，所以最终选它。

FP32 导出很简单：

```bash
uv run export/ncnn/export_ncnn.py
# 产物：runs/detect/train/weights/best_ncnn_model/（9.25MB）
```

INT8 用的是 ncnn 自带工具链手动量化，校准方法选 ACIQ：

```bash
# 1. FP32 优化
ncnnoptimize \
  runs/detect/train/weights/best_ncnn_model/model.ncnn.param \
  runs/detect/train/weights/best_ncnn_model/model.ncnn.bin \
  /tmp/ncnn_opt.param /tmp/ncnn_opt.bin 0

# 2. 生成校准表（200 张 val 图，预处理必须和推理一致）
ncnn2table /tmp/ncnn_opt.param /tmp/ncnn_opt.bin \
  test/ncnn_calib_list.txt /tmp/best_aciq.table \
  'mean=[0,0,0]' 'norm=[0.00392,0.00392,0.00392]' \
  'shape=[640,640,3]' pixel=RGB thread=8 method=aciq

# 3. 量化（注意是旧式参数顺序）
ncnn2int8 /tmp/ncnn_opt.param /tmp/ncnn_opt.bin \
  /tmp/int8_aciq.param /tmp/int8_aciq.bin /tmp/best_aciq.table

# 4. 组装成 Ultralytics 能直接加载的目录
D=runs/detect/train/weights/best_int8_ncnn_model
mkdir -p $D
cp /tmp/int8_aciq.param $D/model.ncnn.param
cp /tmp/int8_aciq.bin  $D/model.ncnn.bin
cp runs/detect/train/weights/best_ncnn_model/metadata.yaml $D/
```

量化工具来自系统包 `ncnn 20261020-1`（Arch 的 extra 仓库），提供 `ncnnoptimize` / `ncnn2table` / `ncnn2int8`。注意 pip 里的 `ncnn` 只含推理库，不含这些工具，两者不能互相替代。

x86 开发机上的对比（`test/test_ncnn_int8.py`，预热 5 次、计时 50 次取均值）：

| 指标 | NCNN FP32 | NCNN INT8（ACIQ） |
| --- | --- | --- |
| 体积 | 9.25MB | 2.46MB（-73%） |
| 端到端均值 | 44.71ms | 34.49ms（-23%） |
| conf | 0.3274 | 0.3804 |
| 检测结果 | 1 框 | 1 框，类别一致，框坐标最大差 4.07px |

体积砍掉七成、精度基本没丢，这个结果我是满意的。板端的具体帧率还没测，等部署环境搭好再补。

## 踩过的坑

### KL 校准把置信度打没了

最开始用的是默认的 KL 校准，置信度直接从 0.3274 掉到 0.157，低于 Ultralytics 默认阈值 0.25，结果就是「明明有手，但输出 0 个框」。

换 ACIQ 之后 conf 反而比 FP32 还高一点（0.3804）。YOLO26 里有 attention 层，KL 的直方图统计对这类激活分布偏激进。换模型后建议 KL 和 ACIQ 都测一遍再定。

### 校准预处理必须和推理完全一致

这个模型的归一化不在 ncnn 计算图里（Input 层没有 mean/scale），Ultralytics 后端是直接喂 letterbox 后的 RGB 0~1 数组。所以校准参数必须严格对应：

- 颜色：RGB，不能是 OpenCV 默认的 BGR
- `mean=[0,0,0]`、`norm=[1/255,...]`
- 尺寸 640×640，letterbox 的 pad 用 114

任何一项不一致，scale 表就是错的，量化后精度会莫名其妙地掉。

### `ncnn2int8` 是旧式参数顺序

它是 `in.param in.bin out.param out.bin table`。按新式顺序传，校准表会落到第 6 个参数上，直接报 `read_int8scale_table failed`。

### `uv sync` 会卸掉自动装的导出依赖

前面提过，导出包是 Ultralytics 临时装的，`uv sync` 一跑就没了，再导出报 `No module named 'onnx'` / `'ncnn'`。要么重新跑一次导出让它再装，要么老老实实 `uv add`。

### 自己写推理验证时最容易骗自己

我用 pyncnn 手写推理时连续踩了两个假阴性：

1. 用 `resize` 而不是 letterbox 预处理，FP32 也检测不到目标；
2. letterbox 之后没有 `np.ascontiguousarray`，pyncnn 按 C-order 读 buffer 错位，输出全是垃圾。

修正后 FP32 能精确复现 0.3274 的置信度，验证结果才可信。另外当时还怀疑过 ncnn 工具把 param 里的参数键弄丢了，对照源码才发现那些键都能由默认值和对称性推导出来，并没有丢——差点写个「修复脚本」修一个不存在的问题。

## 小结

训练本身反而是最省心的一步：数据格式对、参数别乱改、把 `cache="ram"` 打开，剩下的交给早停。真正花时间的是后面：预处理一致性、校准方法、工具参数顺序，任何一个不对都会以「精度掉了」的形式表现出来，很难一眼定位。

下一步准备把模型移到板子上实测帧率，再用 C++ 对齐一遍预处理；电池数据集也打算找时间跑一版对比。完整代码和命令都在项目里，这里只挑了容易踩坑的部分。
