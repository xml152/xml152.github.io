---
title: 'YOLO26 模型训练：如何得到一份标准的 PyTorch 权重'
description: '用 uv 装环境、整理手势数据集、固定训练参数与早停策略，在 x86 开发机上把 YOLO26n 训练成一份可直接转换的 best.pt。'
published: 2026-11-24
category: 技术
tags: ['YOLO', '深度学习', 'PyTorch']
cover: /covers/yolo26.jpg
coverAlt: '深色网格背景上的 YOLO26 检测框与标题'
pinned: true
---

本文只写训练这一步：在 x86 开发机上，用 Ultralytics 把 YOLO26n 训出一份标准的 PyTorch 权重 `best.pt`。目标不是刷指标，而是把数据格式、训练参数、早停策略固定下来，得到一份可复现、能直接拿去转换的模型。

这里得到的是标准的 PyTorch `.pt` 权重，不含任何板端相关的改动；后续的 NCNN 导出、INT8 量化与上板推理，都是在它之上完成的。后续本项目会用作转换模型及边缘部署的前置条件。模型的转换、量化与在龙芯久久派（2K0300）上的部署过程，另见《YOLO26 在龙芯久久派上的部署：从 NCNN 导出到放弃 INT8》。

## 环境和硬件

训练全部在 x86 开发机上完成，下文的速度数据只在这台机器上有意义，不能直接换算成板端帧率。

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

> 导出模型时 Ultralytics 还会临时补装 `onnx` / `ncnn` / `pnnx` 等依赖，这部分属于转换环节，放到部署那篇里说。

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

`yolo26n.pt` 是 YOLO26n 的预训练权重，训练从这里开始，而不是从零初始化。几个参数的实际影响：

| 参数 | 说明 |
| --- | --- |
| `epochs=300` + `patience=50` | 正常不会跑满，指标停滞 50 轮就停 |
| `imgsz=640` | 输入尺寸固定为 640，后续导出和量化校准都要保持一致 |
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

`best.pt` 是按 mAP50-95 挑的，所以最后几轮指标回落也正常，直接用第 16 轮的权重就行。到这里，一份标准的 PyTorch 模型就算到手了：5.3MB 的 `.pt` 文件，Ultralytics 可以直接加载推理，也可以作为后续转换的输入。

换成电池数据集只改 `data=` 一行，`nc` / `names` 会从对应的 `data.yaml` 自动读，不用动代码。

## 目录结构

训练相关的部分只有这些：

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
└── runs/detect/train/
    ├── args.yaml                  # 本次训练的全部参数
    ├── results.csv                # 每轮指标
    └── weights/
        ├── best.pt                # 最优权重，5.3MB
        └── last.pt                # 最后一轮权重
```

`export/`、`test/` 和各路导出产物不属于训练环节，这里先不列。

## 小结

训练本身是最省心的一步：数据格式对、参数别乱改、把 `cache="ram"` 打开，剩下的交给早停，产出就是一份标准的 PyTorch `best.pt`。真正花时间的是后面——预处理一致性、校准方法、工具参数顺序，任何一个不对都会以「精度掉了」的形式表现出来，很难一眼定位。

训练产出的 `best.pt` 就是后续转换模型及边缘部署的输入；模型怎么转成 NCNN、做 INT8 量化、最后在龙芯久久派上跑起来，见 [《YOLO26 在龙芯久久派上的部署：从 NCNN 导出到放弃 INT8》](/posts/4_yolo26久久派部署/)。
