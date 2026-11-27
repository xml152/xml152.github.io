---
title: 'YOLO26 在龙芯久久派上的部署：从 NCNN 导出到放弃 INT8'
description: '以龙芯 2K0300 久久派为目标，记录 NCNN 导出、ACIQ INT8 量化、新世界交叉编译与上板实测，对比旧世界 ABI1.0 工程，并说明最终不用 INT8 的原因。'
published: 2026-11-26
category: 技术
tags: ['YOLO', '深度学习', '模型量化', '龙芯']
cover: /covers/yolo26.jpg
coverAlt: '深色网格背景上的 YOLO26 检测框与标题'
pinned: true
---

上一篇 [《YOLO26 模型训练：如何得到一份标准的 PyTorch 权重》](/posts/2_yolo26模型训练/) 只讲到 `best.pt`。本文接上这一步：把模型转成 NCNN、做 INT8 量化、交叉编译到龙芯 2K0300（久久派 WiFi 版）上跑起来，然后说明为什么最终又放弃了 INT8。另外会和同板卡上旧世界 ABI1.0 的 `ncnn_new` 工程做一次对比，看看换系统究竟带来了什么。

目标板是 LA264 单核 @1GHz、没有 LSX/LASX 向量扩展，跑 PyTorch 不现实；NCNN 运行时更轻，也不拖 Python 依赖，所以选它。板端工程是 `~/projects/99Pi/yolo26_test`，本文的性能数据和结论都来自这个工程；转换与量化的脚本则来自训练项目 `~/projects/python/yolo26`。

## 目标板与工程现状

| 项 | 值 |
| --- | --- |
| 板卡 | 龙芯 2K0300（久久派 WiFi 版） |
| CPU | LA264 单核 @1GHz，无 LSX/LASX |
| 系统 | 新世界 ABI2.0（内核 6.9 / glibc 2.38） |
| 交叉工具链 | `/opt/cross-tools_loongarch`，GCC 13.2 |
| 推理框架 | ncnn 20261020（静态库 `libncnn.a`） |

`yolo26_test` 是旧世界 ABI1.0 上实时手势项目的迁移与重构版本，当前状态：

| 项 | 状态 |
| --- | --- |
| 新世界交叉编译（ncnn 静态库） | ✅ 已打通 |
| 板端运行 | ✅ 已跑通 |
| INT8 量化 | ❌ 实测 FP32 比 INT8 快 25.4%，SWAR 手写内核与 FP32 持平，已否决 |
| 检测后处理 / NMS | ❌ 未实现 |
| 图像输入 / 摄像头 / 显示 | ❌ 未实现（计划 stb_image + V4L2 替代 OpenCV） |

```text
yolo26_test/
├── main.cpp                    # benchmark 入口
├── CMakeLists.txt / CMakePresets.json
├── tools/                      # cpu_probe / alu_bench / swar_bench
├── best_ncnn_model/            # 640 FP32 模型
├── best320_ncnn_model/         # 320 FP32 模型（推荐工作点）
├── best_int8_ncnn_model/       # 640 INT8 模型（已否决）
├── third_party/                # 工具链文件 + ncnn 源码/静态库
├── docs/                       # 交叉编译、烧录、性能分析笔记
└── out/deploy/                 # 拷到板子的部署包
```

现阶段的 `main.cpp` 是纯推理 benchmark：构造一张常量 0.5 的假输入，只计 `input + extract` 的耗时，输出 avg / min / max / fps。也就是说，本文里的「部署」指的是把模型真正跑在板子上并测出速度，完整的应用（读图、解码、显示）还没做。

## 从 best.pt 导出 NCNN

训练得到的 `best.pt` 是转换的起点。FP32 导出就一行核心逻辑：

```python
from ultralytics import YOLO

model = YOLO("runs/detect/train/weights/best.pt")
model.export(format="ncnn", imgsz=640, dynamic=False, simplify=True)
```

产物是 `best_ncnn_model/` 目录，含 `model.ncnn.param`（结构）、`model.ncnn.bin`（权重）和 `metadata.yaml`（类别名等后端元数据）。目录名必须带 `_ncnn_model` 子串，Ultralytics 才会识别。FP32 模型约 9.25MB。

有两个和板子直接相关的细节：

1. **输入尺寸写死在图里**。YOLO26 的头把 anchors 和 stride 折叠进计算图，640 输入对应 8400 个锚点（`14 = 4 框 + 10 类`）。换尺寸必须按新的 `imgsz` 重新导出，不能直接喂 320 的图：

   ```bash
   yolo export model=best.pt format=ncnn imgsz=320 int8=False
   ```

2. **量化工具来自系统包**。Arch 的 `ncnn 20261020-1`（extra 仓库）提供 `ncnnoptimize` / `ncnn2table` / `ncnn2int8`；pip 里的 `ncnn` 只含推理库，不含这些工具，两者不能互相替代。第一次导出时 Ultralytics 会自动补装 `onnx` / `ncnn` / `pnnx`，但这些包不在 `pyproject.toml` 里，`uv sync` 会把它们卸掉；稳妥做法是显式 `uv add onnx onnxruntime onnxslim ncnn "pnnx==20260526"`，临时关闭自动安装可以设 `YOLO_AUTOINSTALL=False`，一般没必要。

### ONNX 留作对照

桌面端推理和对照用 ONNX：`model.export(format="onnx", imgsz=640, dynamic=False, simplify=True)`，加 `int8=True` 走 Ultralytics 内置量化。产物 FP32 9.9MB / INT8 2.9MB，输入 `images` `[1, 3, 640, 640]`（值域 0~1），输出 `output0` `[1, 14, 8400]`；图里没有 NMS，也没有 objectness 分支，自己写推理要解码并做 NMS。板端用不到，不展开。

## INT8 量化（手动 ACIQ 链路）

Ultralytics 内置的 `int8=True` 导出试过，最终没采用；交付的 INT8 模型走的是 ncnn 工具链的手动量化，校准方法选 ACIQ。四步：

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

产物是 `best_int8_ncnn_model/`，约 2.46MB（99Pi 工程里按同一链路重新导出的一份是 2.55MB，体积差异不影响结论）。

### 为什么选 ACIQ

最开始用默认的 KL 校准，置信度从 0.3274 掉到 0.157，低于 Ultralytics 默认阈值 0.25，结果就是「明明有手，但输出 0 个框」。换 ACIQ 之后 conf 反而比 FP32 高一点（0.3804）。YOLO26 里有 attention 层，KL 的直方图统计对这类激活分布偏激进；换模型后建议 KL 和 ACIQ 都测一遍再定。

### x86 上的对比看起来很美

开发机（x86）上的对比（`test/test_ncnn_int8.py`，预热 5 次、计时 50 次取均值）：

| 指标 | NCNN FP32 | NCNN INT8（ACIQ） |
| --- | --- | --- |
| 体积 | 9.25MB | 2.46MB（-73%） |
| 端到端均值 | 44.71ms | 34.49ms（-23%） |
| conf | 0.3274 | 0.3804 |
| 检测结果 | 1 框 | 1 框，类别一致，框坐标最大差 4.07px |

体积砍掉七成、速度快两成、精度基本没丢——在 x86 上，INT8 看起来是个稳赚的选择。当时的结论也就是「板端的具体帧率还没测，等部署环境搭好再补」。后面上板实测，这个结论被完全推翻了。

## 交叉编译与部署到板子

板子跑的是新世界 ABI2.0（glibc 2.38），旧世界的 ncnn 是 GCC 8.3 + glibc 2.28 编的，引用 `GLIBC_2.27` 符号，链接期直接报 `undefined reference to strstr@GLIBC_2.27`。ABI1.0 与 ABI2.0 的调用约定也不兼容，唯一解法是用新世界工具链把依赖全部重编。

```bash
# 1. 编译 ncnn 静态库（只需一次）
third_party/build_ncnn_newworld.sh 20261020
# 产物：third_party/ncnn-newworld/lib/libncnn.a（约 8MB）

# 2. 编译工程
cmake --preset loongarch_newworld
cmake --build out/build/loongarch_newworld
# 产物：out/build/loongarch_newworld/yolo26_test

# 3. 组装部署包
mkdir -p out/deploy
cp out/build/loongarch_newworld/{yolo26_test,cpu_probe,alu_bench} out/deploy/
# 再把模型目录一起放进去，例如 best_ncnn_model/
```

ncnn 的配置关掉 Vulkan、tools、examples、benchmark、tests、Python 与绘图，保留 `NCNN_OPENMP=ON` 和 `NCNN_INT8=ON`（后者只是保留 int8 模型加载能力）。编译期会提示 `NCNN_COMPILER_SUPPORT_LOONGARCH_LSX - Failed`、`NCNN_LSX 0`——这不是配置失误，板端 CPU 本身也没有 LSX。

板端只需要一个可执行文件 + 模型目录：libstdc++ 静态链入，动态依赖只剩 glibc / libgomp / libm。ABI 校验结果：

```text
GLIBC 需求 : GLIBC_2.36 / GLIBC_2.38      ← 与板端 glibc 2.38 对齐
NEEDED     : libgomp.so.1 / libm.so.6 / libc.so.6 / ld-linux-loongarch-lp64d.so.1
libstdc++  : 已静态链入
```

运行方式（第 5 个参数必须和导出时的 `imgsz` 一致，因为 anchors 写死在图里）：

```bash
./yolo26_test <模型目录> [轮数] [线程数] [预热次数] [输入尺寸]
./yolo26_test ./best_ncnn_model 3 0 1 640
```

## 板上实测

测试条件：`./yolo26_test <模型> 3 0 1`，单核 1GHz、无其他负载，3 轮取均值（方差 < 5ms）。

| 模型 | avg | min | max | fps |
| --- | --- | --- | --- | --- |
| INT8 @640 | **11904.21 ms** | 11900.80 | 11910.17 | 0.08 |
| FP32 @640 | **8883.52 ms** | 8878.19 | 8888.14 | 0.11 |
| FP32 @320 | 2100 ms | — | — | 0.48 |
| FP32 @288 | 1665 ms | — | — | 0.60 |

**FP32 比 INT8 快 25.4%，INT8 量化在这块板上是净负收益。** 这和旧世界项目在 2K0300 上的观察一致：换到新世界 ABI2.0 并没有带来速度收益（±5%），瓶颈是完全相同的标量硬件。

再看算力：模型 6.1 GFLOPs（3.05 G MAC），640 输入实测 8.88s，有效吞吐约 0.344 G MAC/s；微基准里标量 `fp32_fma` 是 0.34 G MAC/s。两者几乎完全一致，说明 ncnn 的标量卷积内核已经贴着这颗核的硬件上限，软件侧没有多少空间了。

不同输入尺寸的精度 / 速度折中（val 集 200 张，x86 ncnn 评估）：

| imgsz | mAP50 | 板上耗时 | 结论 |
| --- | --- | --- | --- |
| 640 | 0.9924 | 8884 ms | 基线 |
| 320 | 0.9513 | 2100 ms | 推荐工作点（-4.1 点） |
| 288 | 0.9061 | 1665 ms | 速度折中（-8.6 点） |
| 224 | 0.6186 | 预估 ~1.0 s | ❌ 不可用 |
| 160 | 0.1471 | 预估 ~0.5 s | ❌ 完全崩坏 |

模型是在 640 上训练的，低分辨率属于没训练过的尺度；目标缩到 40px 以下后 P3 特征已经撑不住。最终工作点定在 320：mAP50 只掉 4.1 点，耗时从 8.9s 降到 2.1s。288 只快 0.44s 却多掉 4.5 点，不划算。

## 与旧世界 ABI1.0 部署的对比

同一块久久派上其实先后跑过两套系统：`~/projects/99Pi/loongArch_guest/ncnn_new` 是出厂旧世界 ABI1.0 下的完整手势识别应用，本文的 `yolo26_test` 是刷成新世界 ABI2.0 后的重构版。把两者放在一起，能分清哪些变化是迁移带来的、哪些其实是硬件决定的。

### 环境与应用形态

| 维度 | 旧世界 `ncnn_new` | 新世界 `yolo26_test` |
| --- | --- | --- |
| 系统 / ABI | 出厂旧世界 ABI1.0（PMON 启动） | 新世界 ABI2.0（U-Boot + U 盘 rootfs，内核 6.9 / glibc 2.38） |
| 工具链 | GCC 8.3 `loongarch64-linux-gnu-`，glibc 2.28 | GCC 13.2 `loongarch64-unknown-linux-gnu-`，glibc 2.38 |
| ncnn | `/opt/ncnn_loongarch/lib/libncnn.so`（动态库） | 自编 20261020 `libncnn.a`（静态库） |
| 其它依赖 | OpenCV 4.x（龙芯版） | 无，板端只要可执行文件 + 模型目录 |
| 程序形态 | 完整应用：USB 摄像头 640×480@30fps → 异步流水线 → letterbox + NMS → OLED `/dev/fb0` 显示 → SPI 发指令给 ESP32S3 | 纯推理 benchmark：常量假输入，只测 `input + extract` |

旧工程已经把「能用」做完了：采集线程按 30fps 持续推帧，推理线程每 10 帧取一次最新帧（跳帧 + 最新帧优先队列），主线程复用上一帧检测框保持画面流畅，置信度 0.25 / NMS 0.45，还带 `BenchResult` 分别统计预处理、推理、后处理耗时。新工程目前只验证「模型能不能在板子上跑、跑多快」，完整链路要按新 ABI 重写。

### 模型对比

| 项 | 旧模型 `new_224model.ncnn.*` | 新模型（640 训练） |
| --- | --- | --- |
| 层数 / blob | 316 / 376 | 320 / 382 |
| 卷积层 | 94（+8 depthwise） | 94（+8 depthwise） |
| 参数量 | ≈2.38 M（bin 9.52 MB） | 2.54 M（bin 9.58 MB） |
| 输入 / anchors | 224 / 1029 | 640 / 8400（另有 320 / 288 等重导版） |
| 量化 | 无（FP32） | 无（FP32，INT8 已否决） |
| 输出布局 | `14 × 1029`（末尾有 Permute） | `1029 × 14` |
| 类别名 | 10 类手势，与新版相同（`main.cpp` 里还留着早期 0~9 数字手势的注释） | 10 类手势（A / number 7 / …） |

宿主机（x86，单线程，ncnn 1.0.20261020）实测：旧 224 为 11.25ms，新 224 为 11.51ms，新 320 为 22.45ms。旧模型只比新模型少 4 层、参数少 6%，同样 224 输入下速度差异 <3%，不存在「旧模型更快」的可能。

### 速度对比

旧工程 `main.cpp` 的注释写着「224 模型推理 ~1 秒，比 320 快 51%」「每 10 帧推理一次（~330ms 推理间隔）」，即最终版 224 ≈ 1 s、320 ≈ 2 s。注意早期提交 `f0268d6`（2026-05-10）里的「推理 3s 每次」是优化之前的版本，不能拿它当基线。

| 场景 | 旧世界 ABI1.0 | 新世界 ABI2.0 | 差异 |
| --- | --- | --- | --- |
| 224 输入 | ≈1000 ms | 974 ms（跑旧模型） | ≈ -3% |
| 320 输入 | ≈2000 ms | 2100 ms（跑新模型） | ≈ +5% |

**换到新世界 ABI2.0 在速度上几乎零收益（±5%）**，两边都是同一颗没有 SIMD 的标量核在算。迁移的价值在生态与可维护性、以及新模型更好的精度，而不在速度。旧工程靠异步流水线提升的是「系统吞吐」——30fps 预览、约 1fps 检测——而不是单帧算力。

### 几个被推翻的旧结论

旧工程 README（2026-05-12）里留着三条早期判断，后来都被实测推翻：

- **「启用 FP16 运算、推理速度提升 3-5 倍」**：同一时期的 `nc_yolo.cpp` 已经把 `use_fp16_storage / arithmetic / packed` 全设为 `false`，注释写得很直白——「龙芯 2K0300 无 FP16 硬件单元，开启会触发软件模拟反而更慢」。
- **「INT8 可再提速 2-3 倍」**：旧项目在 2K0300 上用 int8 同样变慢，和新世界的实测一致；原因见下一节。
- **「2K0300 支持 LASX」**：`tools/cpu_probe` 读 CPUCFG2 得到 `LSX=0 LASX=0`，工具链也不认 `-mlsx` / `-mlasx`，硬件层面就没有向量单元。

真正值得沿用的不是量化，而是旧工程的工程结构：异步流水线、`lightmode`、`num_threads = 2`、预处理零拷贝——这些提升的是系统吞吐，不是单帧算力。

## 为什么最终不使用 INT8 量化

x86 上快 23%，到板端反而多花 34% 的时间（11904 / 8884），原因不在量化脚本，而在硬件：

1. **INT8 的加速前提是 SIMD 内核**。ncnn 的 int8 路径靠一次并行处理 4/8/16 个元素取胜；而这颗 CPU 没有任何向量指令。`tools/cpu_probe` 直接读 CPUCFG 得到 `LSX=0 LASX=0`（CPUCFG2 bit6/7 = 0），内核侧 `getauxval` 也是 0，说明不是内核漏报；GCC 13.2 连 `-mlsx` / `-mlasx` 都不认识，`NCNN_LSX 0`，int8 只能走标量路径。
2. **标量下 int8 和 fp32 的乘加吞吐相同**。int8 只剩「权重体积小、缓存友好」这一点优势，却要额外付 8 通道 pack/unpack 和每通道 requant 的开销，一进一出反而更慢。
3. **手写 SWAR 也没救**。用 64 位通用寄存器做伪 SIMD 的尝试（`tools/swar_bench.c`，2/4 桶打包，带正确性自检）结果是：`fp32_fma` 0.34、`int8_scalar` 0.25、`swar2` 0.33、`swar4` 0.33 G MAC/s——SWAR 与 FP32 完全持平，int8 标量反而更差。SWAR 要求乘法一端是单桶标量，且 int8 乘积占满 16 位桶只能累加一次，要么每步扩宽、要么退化成 2 个 32 位桶，指令效率和单条 `fmadd` 一样。CPU 虽然有 LSPW（打包字扩展），但 GCC/LLVM/binutils 全都不支持相关助记符，只能手写机器码，工程上不可行。
4. **fp16 同理**：没有 fp16 运算单元，纯转换开销，旧项目的 fp16 方案不必沿用。

所以最终交付用的是 **FP32**：2.46MB 的体积优势在这块板上换不来速度，反而要多花约三分之一的时间。想要实质提速只能减少计算量——降分辨率、通道剪枝 / 蒸馏，或者换一块带 LSX 的板子。

## 转换与量化阶段踩过的坑

除了上面的结论，链路里还有几个容易骗自己的地方：

- **校准预处理必须和推理完全一致**。模型的归一化不在 ncnn 计算图里，Ultralytics 后端直接喂 letterbox 后的 RGB 0~1 数组；所以校准必须 RGB（不是 OpenCV 默认 BGR）、`mean=[0,0,0]`、`norm=[1/255,...]`、640×640、letterbox pad 用 114。任何一项不一致，scale 表就是错的，量化后精度会莫名其妙地掉。
- **`ncnn2int8` 是旧式参数顺序**：`in.param in.bin out.param out.bin table`。按新式顺序传，校准表会落到第 6 个参数，直接报 `read_int8scale_table failed`。
- **`uv sync` 会卸掉自动装的导出依赖**，再导出报 `No module named 'onnx'` / `'ncnn'`。要么重新跑一次导出让它再装，要么老老实实 `uv add`（见前文）。
- **自己写 pyncnn 推理验证时最容易骗自己**：用 `resize` 而不是 letterbox，FP32 也检测不到目标；letterbox 后没有 `np.ascontiguousarray`，pyncnn 按 C-order 读 buffer 错位，输出全是垃圾。修正后 FP32 能精确复现 0.3274 的置信度，验证结果才可信。

## 当前限制与下一步

`main.cpp` 目前只是 benchmark：假输入、无真实预处理，只检查 `out0` 形状，没解析框和类别。剩下要做的事按优先级：

1. 去掉 OpenCV 依赖：`stb_image` 读图 + 自写 letterbox；
2. 检测后处理：解析 `out0`（8400×14）→ 阈值筛选 → NMS → 坐标映射回原图；
3. 摄像头输入（V4L2）、framebuffer 显示、采集 / 推理双线程流水线（旧世界工程 `ncnn_new` 已有完整实现，按新 ABI 重写即可）。

另外板上内核没开 `CONFIG_CPU_FREQ`，频率固定不可调；ncnn 版本号显示为编译日期，是因为浅 clone 没有 tag，不影响功能。

## 小结

这条链路是完整跑通的：训练出 `best.pt` → 导出 NCNN → ACIQ INT8 量化 → 新世界交叉编译 → 久久派上板实测。有意思的是结论的反转——INT8 在 x86 上又小又快，到了没有 SIMD 的 LA264 单核上反而比 FP32 多花约三分之一的时间（FP32 快 25.4%），于是最终部署用的是 FP32。和旧世界 ABI1.0 工程一比，换系统、换工具链、换模型也只换来 ±5% 的速度浮动。量化不是万能加速，得看目标硬件有没有对应的指令；旧工程真正留下来的资产是那套异步流水线，不是 FP16 / INT8。
