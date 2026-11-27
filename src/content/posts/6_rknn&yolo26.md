---
title: 'RK3588 上手 RKNN：NPU 驱动、YOLO26 模型转换与 rknn-toolkit2 安装'
description: '在 x86 上用 rknn-toolkit2 把 YOLO26 转成 RKNN 模型（含依赖版本坑与 requirements 清单），再到板卡上装 uv、克隆 rknn-toolkit2 仓库的部署前置准备。其他型号的 RK 板卡同样可参考。'
published: 2026-11-27
category: 技术
tags: ['瑞芯微', 'rk3588', 'RKNN', '模型部署']
cover: /covers/rknn&yolo26.jpg
coverAlt: 'RKNN & YOLO26 模型部署'
pinned: true
---

记录 RK3588 板卡安装 NPU 驱动以及模型转换和推理的过程。关于 rknn-toolkit2 的安装，其他型号的 RK 板卡也可参考。

模型转换部分参考先前的 [《YOLO26 模型训练：如何得到一份标准的 PyTorch 权重》](/posts/2_yolo26模型训练/) 一文，使用 rknn-toolkit2 进行模型转换。

## 模型转换部分

### 1. 新建虚拟环境

转换 RKNN 的虚拟环境可能与原环境产生冲突，建议单独建一个：

```zsh
python3 -m venv .rknn
source .rknn/bin/activate
```

### 2. 编写转换代码

我仍然沿用原训练项目的项目结构，在 export 目录下新建 `export/rknn/export_rknn.py`：

```python
from ultralytics import YOLO

model = YOLO("runs/detect/train/weights/best.pt")
model.export(
    format="rknn",
    name="rk3588",          # target_platform：必须与板端 NPU 驱动版本匹配
    imgsz=640,
    batch=1,                # RKNN 只支持固定 batch，改大要重导
    quantize=8,             # INT8；16 为 FP16
    data="datasets/hands_gesture/data.yaml",   # 校准集，取 val 的 200 张
)
```

### 3. 安装所需的 pip 包

为了便于后续使用，我在 `export_rknn.py` 目录下导出了对应的 requirements.txt，可以使用 `pip install -r requirements.txt` 命令安装：

```text
# rknn-toolkit2 2.5.0 构建 YOLO26 失败，ultralytics 钉 >=2.3.2,<2.5
rknn-toolkit2==2.3.2
# rknn-toolkit2 上限；转换只跑 x86 CPU，无需 CUDA 版
torch==2.2.0
torchvision==0.17.0
numpy==1.26.4
# rknn 导出要求 onnx<1.19，且 opset<=19
onnx==1.18.0
onnxruntime==1.20.1
onnxslim==0.1.99
# rknn-toolkit2 依赖 pkg_resources，setuptools 82 起已移除
setuptools==79.0.1
protobuf==4.25.4
# 保留 numpy 1.x 可用的最后一档
opencv-python==4.11.0.86
ultralytics==8.4.193
```

### 4. 运行转换

安装完成后运行转换代码：

```zsh
source ./.rknn/bin/activate
python export/rknn/export_rknn.py
```

转换后的产物在转换前的 weights 目录下的 `best_rknn` 目录，包含 `best-rk3588.rknn`、`tail.onnx` 和 `metadata.yaml` 三个文件：

- `tail.onnx` 和 rknn 模型文件需要**成对使用**；
- `metadata.yaml` 是 rknn-toolkit2 的模型转换信息，包含输入输出信息、模型结构等。

### 注意：输入输出 dtype 被修改

同时注意转换模型的日志，我这边有以下提示——也就是说 rknn-toolkit2 在转换模型时为了性能优化，修改了输入输出的默认数据类型，部署时需要注意：

```text
W build: The default input dtype of 'images' is changed from 'float32' to 'int8' in rknn model for performance!
         Please take care of this change when deploy rknn model with Runtime API!
W build: The default output dtype of '/model.23/cv2.0/cv2.0.2/Conv_output_0' is changed from 'float32' to 'float16' in rknn model for performance!
         Please take care of this change when deploy rknn model with Runtime API!
W build: The default output dtype of '/model.23/cv3.0/cv3.0.2/Conv_output_0' is changed from 'float32' to 'int8' in rknn model for performance!
         Please take care of this change when deploy rknn model with Runtime API!
W build: The default output dtype of '/model.23/cv2.1/cv2.1.2/Conv_output_0' is changed from 'float32' to 'float16' in rknn model for performance!
         Please take care of this change when deploy rknn model with Runtime API!
W build: The default output dtype of '/model.23/cv3.1/cv3.1.2/Conv_output_0' is changed from 'float32' to 'int8' in rknn model for performance!
         Please take care of this change when deploy rknn model with Runtime API!
W build: The default output dtype of '/model.23/cv2.2/cv2.2.2/Conv_output_0' is changed from 'float32' to 'float16' in rknn model for performance!
         Please take care of this change when deploy rknn model with Runtime API!
W build: The default output dtype of '/model.23/cv3.2/cv3.2.2/Conv_output_0' is changed from 'float32' to 'int8' in rknn model for performance!
         Please take care of this change when deploy rknn model with Runtime API!
```

## 板卡部署部分

上面的模型转换都是在本地电脑进行的，接下来是板卡部署部分。前置条件是板卡先装好系统，参考 [《正点原子 RK3588 在 Linux 下烧录系统及 SSH 踩坑》](/posts/3_3588_烧录连接/)。有兴趣也可以参考 [《个人 zsh 使用以及配置》](/posts/5_zsh配置/) 优化一下 shell，便于后续操作。

### 1. 安装 uv

安装 uv，便于后续使用 Python：

```zsh
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. 克隆 rknn-toolkit2 仓库

```zsh
git clone https://github.com/airockchip/rknn-toolkit2.git
```

如果网络有问题，可以使用镜像加速。githubstore 中有可用的镜像列表，可查询 / 测速镜像实现加速，不必拘泥于单个镜像，镜像列表地址：<https://git.hiwiki.org/zh-CN/mirrors>。

如果镜像站不支持 `git clone` 加速，可以先下载 zip 包到本地，再用 scp 把文件发送至板卡，解压后进入 rknn-toolkit2 目录。

本地发送：

```zsh
# scp rknn-toolkit2.zip rockchip@<板卡IP地址>:/home/rockchip/rknn
scp rknn-toolkit2-master.zip rockchip@192.168.3.89:/home/rockchip
```

板卡解压文件：

```zsh
cd ~/rknn
unzip rknn-toolkit2-master.zip
```

### 3. 创建 demo 目录和虚拟环境

```zsh
mkdir -p ~/rknn/yolo26_demo
cd yolo26_demo
uv init --python=3.12
source ./.venv/bin/activate
```

### 4. 检查 NPU 驱动

现在还不确定开发板系统中是否内置 NPU 驱动，使用以下命令检测。检测时可能由于权限问题导致文件不可读，建议加上 `sudo` 提权：

```zsh
# 检查内核驱动版本
sudo cat /sys/kernel/debug/rknpu/version
# 查看 NPU 初始化日志
sudo dmesg | grep -i "Initialized rknpu"
# 开放 debugfs 权限，便于后续查看时不用加 sudo（可选）
sudo mount -o remount,mode=755 /sys/kernel/debug
```

再查一下内核配置：

```zsh
# 查看内核配置
zcat /proc/config.gz 2>/dev/null | grep -i RKNPU
```

我这边给出的结果分别是：

```text
RKNPU driver: v0.9.8
[    4.955461] [drm] Initialized rknpu 0.9.8 for fdab0000.npu on minor 1
```

```text
# Rockchip RKNPU3
CONFIG_ROCKCHIP_RKNPU3=y
# end of Rockchip RKNPU3
# RKNPU
CONFIG_ROCKCHIP_RKNPU=y
CONFIG_ROCKCHIP_RKNPU_DEBUG_FS=y
# CONFIG_ROCKCHIP_RKNPU_PROC_FS is not set
# CONFIG_ROCKCHIP_RKNPU_FENCE is not set
# CONFIG_ROCKCHIP_RKNPU_SRAM is not set
CONFIG_ROCKCHIP_RKNPU_DRM_GEM=y
# CONFIG_ROCKCHIP_RKNPU_DMA_HEAP is not set
# end of RKNPU
```

其中：

- `RKNPU driver: v0.9.8` 与 `[drm] Initialized rknpu 0.9.8 ...` 说明加载的是 v0.9.8 版本的驱动；
- `CONFIG_ROCKCHIP_RKNPU=y` 说明驱动编译进了内核，而非手动加载。

也就是说，系统中已经存在 v0.9.8 版本的 NPU 驱动。

### 5. 安装 rknn-toolkit-lite2 并验证 NPU

既然驱动已经存在、系统也正常识别，下面安装 rknn-toolkit-lite2 并验证驱动是否真实可用：

```zsh
# 这里注意虚拟环境中的 python 版本和安装包的要一致，我在创建虚拟环境时使用了 python3.12，所以安装包也要是 cp312 的
uv add ~/rknn/rknn-toolkit2-master/rknn-toolkit-lite2/packages/rknn_toolkit_lite2-2.5.0-cp312-cp312-manylinux_2_17_aarch64.manylinux2014_aarch64.whl
```

在 `yolo26_demo` 目录下新建一个 Python 文件，做一次真实推理验证：

```zsh
vim test_npu.py
```

```python
import numpy as np
from rknnlite.api import RKNNLite

r = RKNNLite()
print("load_rknn   :", r.load_rknn("/home/rockchip/rknn/best_rknn_model/best-rk3588.rknn"))
print("init_runtime:", r.init_runtime(core_mask=RKNNLite.NPU_CORE_0))

outs = r.inference(
    inputs=[np.random.randint(0, 255, (1, 640, 640, 3), dtype=np.uint8)],
    data_format=["nhwc"],
)
for i, o in enumerate(outs):
    print(i, o.shape, o.dtype)
r.release()
```

运行测试：

```zsh
uv run test_npu.py
```

输出：

```text
load_rknn   : 0
I RKNN: [17:52:29.548] RKNN Runtime Information, librknnrt version: 2.3.2 (429f97ae6b@2025-04-09T09:09:27)
I RKNN: [17:52:29.548] RKNN Driver Information, version: 0.9.8
I RKNN: [17:52:29.548] RKNN Model Information, version: 6, toolkit version: 2.3.2(compiler version: 2.3.2 (e045de294f@2025-04-07T19:48:25)), target: RKNPU v2, target platform: rk3588, framework name: ONNX, framework layout: NCHW, model inference type: static_shape
W RKNN: [17:52:29.565] query RKNN_QUERY_INPUT_DYNAMIC_RANGE error, rknn model is static shape type, please export rknn with dynamic_shapes
W Query dynamic range failed. Ret code: RKNN_ERR_MODEL_INVALID. (If it is a static shape RKNN model, please ignore the above warning message.)
init_runtime: 0
0 (1, 4, 80, 80) float32
1 (1, 10, 80, 80) float32
2 (1, 4, 40, 40) float32
3 (1, 10, 40, 40) float32
4 (1, 4, 20, 20) float32
5 (1, 10, 20, 20) float32
```

其中 `init_runtime: 0` 表示返回值为 0，也就是说 NPU 可以正常使用了，无需单独安装 NPU 驱动或者编译。当然这里还是要画个饼：后续我会考虑移植 Armbian，到那时候再写安装 `librknnrt.so` 以及编译 `rknpu.ko` 的步骤。

### 6. 发送模型到板卡

用 scp 命令将转换好的模型发送至开发板：

```zsh
scp -r best_rknn_model rockchip@192.168.3.89:/home/rockchip/rknn
```

### 7. 编写推理与测速脚本

下面编写实际测试模型推理的代码，用来测试训练好的 YOLO 模型，这里我新建了 `train.py`：

```python
# YOLO26 在 RK3588 NPU 上的速度基准 + 真实检测结果可视化
import time
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from rknnlite.api import RKNNLite

# ================= 路径配置（基于脚本所在目录，任意位置运行都不会错） =================
HERE              = Path(__file__).resolve().parent
TEST_IMAGE_PATH   = HERE / "image" / "test.png"                     # ← 测试图
OUTPUT_IMAGE_PATH = HERE / "image" / "result_speed.jpg"             # ← 结果图
RKNN_MODEL_PATH   = HERE / "best_rknn_model" / "best-rk3588.rknn"   # ← int8 rknn 模型
TAIL_ONNX_PATH    = HERE / "best_rknn_model" / "tail.onnx"          # ← 必须与 rknn 成对使用
# =====================================================================================

# 推理参数
WARMUP_RUNS = 10     # 预热次数（不计入统计）
TEST_RUNS   = 50     # 正式计时次数
INPUT_SIZE  = 640    # 模型输入尺寸
CONF_THRES  = 0.25   # 置信度阈值
IOU_THRES   = 0.45   # NMS IoU 阈值

# metadata.yaml 里的 names，顺序必须与训练/导出时一致
NAMES = ["A", "number 7", "D", "I", "L", "V", "W", "Y", "I love you", "number 5"]
PALETTE = np.random.default_rng(42).integers(60, 255, size=(len(NAMES), 3)).tolist()


def load_model(model_path):
    rknn = RKNNLite()
    ret = rknn.load_rknn(str(model_path))
    assert ret == 0, f"load_rknn failed: {ret}"
    # 静态 shape + 单 batch，只需初始化一次；RK3588 有 3 个 NPU 核
    ret = rknn.init_runtime(core_mask=RKNNLite.NPU_CORE_0)
    assert ret == 0, f"init_runtime failed: {ret}"
    return rknn


def letterbox(img, size=INPUT_SIZE, color=(114, 114, 114)):
    """等比缩放 + 居中灰边。返回 (图像, 缩放比, pad_x, pad_y)

    YOLO 训练用的是 letterbox 而不是直接 resize，用 resize 会让长宽比失真、精度下降。
    """
    h, w = img.shape[:2]
    r = min(size / h, size / w)
    nw, nh = int(round(w * r)), int(round(h * r))
    dw, dh = (size - nw) / 2, (size - nh) / 2
    if (w, h) != (nw, nh):
        img = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
    top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
    left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
    img = cv2.copyMakeBorder(img, top, bottom, left, right,
                             cv2.BORDER_CONSTANT, value=color)
    return img, r, left, top


def preprocess(img_path, size=INPUT_SIZE):
    """读图 + letterbox。返回 (原图, letterbox 图, 缩放比, pad_x, pad_y)

    注意：Ultralytics 训练与推理全程使用 BGR，这里不做 BGR->RGB 转换。
    """
    img = cv2.imread(str(img_path))
    assert img is not None, f"无法读取图像: {img_path}"
    lb, r, pad_x, pad_y = letterbox(img, size)
    return img, lb, r, pad_x, pad_y

def run_benchmark(rknn, lb, mode="uint8"):
    """跑 WARMUP_RUNS + TEST_RUNS 次推理，返回 (计时列表, 最后一次输出)

    lite2 的 inference() 没有 want_float 参数，输入格式由 data_type / data_format 控制：
      uint8   + nhwc：直接把 uint8 BGR 图丢给 runtime，内部完成量化（推荐，最快）
      float32 + nhwc：自己转 float32，runtime 再按量化参数转 int8（多一层开销）
    注意：这个模型的输入是 NHWC，写 nchw 会被 runtime 警告并强制转换，没有意义。
    """
    if mode == "uint8":
        inp = np.expand_dims(lb, 0)                       # (1, 640, 640, 3) uint8
        kwargs = dict(data_type="uint8", data_format="nhwc")
    else:
        inp = np.expand_dims(lb, 0).astype(np.float32)    # (1, 640, 640, 3) float32
        kwargs = dict(data_type="float32", data_format="nhwc")

    times, outputs = [], None
    for i in range(WARMUP_RUNS + TEST_RUNS):
        t0 = time.perf_counter()
        outputs = rknn.inference(inputs=[inp], **kwargs)
        t1 = time.perf_counter()
        if i >= WARMUP_RUNS:
            times.append((t1 - t0) * 1000.0)  # ms
    return times, outputs


def load_tail(path=TAIL_ONNX_PATH):
    """加载 tail.onnx（负责检测头后半段的解码，常驻 CPU）"""
    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    return sess, [i.name for i in sess.get_inputs()]


def run_tail(sess, tail_input_names, outs):
    """把 NPU 的 6 个原始输出喂给 tail.onnx，得到 (14, 8400)

    NPU 输出顺序与 tail.onnx 的输入顺序一致：
      [1,4,80,80] [1,10,80,80] [1,4,40,40] [1,10,40,40] [1,4,20,20] [1,10,20,20]
    """
    assert len(outs) == len(tail_input_names), \
        f"NPU 输出数 {len(outs)} != tail.onnx 输入数 {len(tail_input_names)}"
    feeds = {n: np.ascontiguousarray(o.astype(np.float32))
             for n, o in zip(tail_input_names, outs)}
    return sess.run(None, feeds)[0][0]


def nms(boxes, scores, iou_thres):
    """纯 numpy NMS，boxes 为 xyxy"""
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.clip(xx2 - xx1, 0, None) * np.clip(yy2 - yy1, 0, None)
        iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-9)
        order = order[1:][iou <= iou_thres]
    return keep


def postprocess(pred, r, pad_x, pad_y, ori_shape,
                conf_thres=CONF_THRES, iou_thres=IOU_THRES):
    """pred: (14, 8400)，前 4 行为 cx,cy,w,h（640 letterbox 空间），其后为 10 类分数

    实测确认：坐标是 cxcywh 而非 xyxy，且类别分数已经过 sigmoid（0~1）。
    返回 ndarray[n, 6] = x1,y1,x2,y2,score,cls（已还原到原图坐标）
    """
    pred = pred.T                                   # (8400, 14)
    boxes, scores = pred[:, :4], pred[:, 4:]

    cls_ids = scores.argmax(1)
    conf = scores[np.arange(len(scores)), cls_ids]
    m = conf >= conf_thres
    if not m.any():
        return np.zeros((0, 6), dtype=np.float32)
    boxes, conf, cls_ids = boxes[m], conf[m], cls_ids[m]

    # cxcywh -> xyxy
    xyxy = np.empty_like(boxes)
    xyxy[:, 0] = boxes[:, 0] - boxes[:, 2] / 2
    xyxy[:, 1] = boxes[:, 1] - boxes[:, 3] / 2
    xyxy[:, 2] = boxes[:, 0] + boxes[:, 2] / 2
    xyxy[:, 3] = boxes[:, 1] + boxes[:, 3] / 2

    keep = nms(xyxy, conf, iou_thres)
    xyxy, conf, cls_ids = xyxy[keep], conf[keep], cls_ids[keep]

    # letterbox 逆变换：先去掉 padding，再除以缩放比
    xyxy[:, [0, 2]] = (xyxy[:, [0, 2]] - pad_x) / r
    xyxy[:, [1, 3]] = (xyxy[:, [1, 3]] - pad_y) / r
    h, w = ori_shape
    xyxy[:, [0, 2]] = xyxy[:, [0, 2]].clip(0, w - 1)
    xyxy[:, [1, 3]] = xyxy[:, [1, 3]].clip(0, h - 1)
    return np.concatenate([xyxy, conf[:, None], cls_ids[:, None]], 1).astype(np.float32)


def draw(img, dets):
    """在图上画检测框"""
    out = img.copy()
    for x1, y1, x2, y2, score, cls in dets:
        c = PALETTE[int(cls)]
        p1, p2 = (int(x1), int(y1)), (int(x2), int(y2))
        cv2.rectangle(out, p1, p2, c, 2)
        label = f"{NAMES[int(cls)]} {score:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(out, (p1[0], p1[1] - th - 6), (p1[0] + tw + 4, p1[1]), c, -1)
        cv2.putText(out, label, (p1[0] + 2, p1[1] - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)
    return out

def report(name, times):
    arr = np.array(times)
    print(f"[{name:>14}] runs={len(arr)}  "
          f"avg={arr.mean():6.2f} ms  min={arr.min():6.2f} ms  "
          f"max={arr.max():6.2f} ms  p50={np.percentile(arr,50):6.2f} ms  "
          f"fps={1000.0/arr.mean():6.2f}")


def main():
    rknn = load_model(RKNN_MODEL_PATH)
    sess, tail_names = load_tail()
    orig_img, lb, r, pad_x, pad_y = preprocess(TEST_IMAGE_PATH)
    print(f"图片: {TEST_IMAGE_PATH}  {orig_img.shape[1]}x{orig_img.shape[0]}"
          f"  -> letterbox {lb.shape[1]}x{lb.shape[0]} ratio={r} pad=({pad_x},{pad_y})\n")

    # ---------- 1) NPU 推理速度：uint8/NHWC vs float32/NCHW ----------
    times_u8,  out_u8  = run_benchmark(rknn, lb, mode="uint8")
    times_f32, _       = run_benchmark(rknn, lb, mode="float")
    report("uint8 + NHWC", times_u8)
    report("float32 + NHWC", times_f32)

    print("\n输出张量（lite2 已统一反量化为 float32）:")
    for i, o in enumerate(out_u8):
        print(f"  out[{i}] shape={o.shape} dtype={o.dtype}")

    # ---------- 2) tail.onnx 解码 + NMS ----------
    t0 = time.perf_counter()
    pred = run_tail(sess, tail_names, out_u8)
    t_tail = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    dets = postprocess(pred, r, pad_x, pad_y, orig_img.shape[:2])
    t_post = (time.perf_counter() - t0) * 1000

    print(f"\ntail.onnx 解码: {t_tail:.2f} ms   后处理(过滤+NMS): {t_post:.2f} ms")
    print(f"检出 {len(dets)} 个目标:")
    for x1, y1, x2, y2, s, c in dets:
        print(f"  {NAMES[int(c)]:<10} conf={s:.3f}  "
              f"box=({x1:.0f},{y1:.0f})-({x2:.0f},{y2:.0f})")

    # ---------- 3) 保存结果图 ----------
    vis = draw(orig_img, dets)
    summary = (f"npu {np.mean(times_u8):.1f}ms | f32 {np.mean(times_f32):.1f}ms "
               f"| dets {len(dets)}")
    cv2.putText(vis, summary, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
    cv2.imwrite(str(OUTPUT_IMAGE_PATH), vis)
    print(f"\n结果图像已保存: {OUTPUT_IMAGE_PATH}")

    rknn.release()


if __name__ == "__main__":
    main()
```

### 8. 安装依赖并运行

使用前需要安装 `onnxruntime`（和 `tail.onnx` 协同）与 `opencv-python`（读取图像）：

```zsh
uv add onnxruntime opencv-python
```

如果下载速度慢，可以尝试换源安装，修改项目 `pyproject.toml` 添加两行：

```toml
[[tool.uv.index]]
url = "https://mirrors.pku.edu.cn/pypi/web/simple"
```

运行：

```zsh
uv run train.py
```

不出意外就可以看到最后的交付产物在 `yolo26_demo/image`。同时日志上可以看出推理速度极快，50 轮平均速度在 40 ms 左右：

```text
[  uint8 + NHWC] runs=50  avg= 40.71 ms  min= 39.38 ms  max= 43.37 ms  p50= 40.69 ms  fps= 24.57
[float32 + NHWC] runs=50  avg= 41.61 ms  min= 39.75 ms  max= 44.96 ms  p50= 41.57 ms  fps= 24.03
```

## 小结

本次主要是跑通了 YOLO26 从标准 PyTorch 模型转换到 RKNN，并在 RK3588 上部署、使用 NPU 推理模型的完整链路。

## 后续可以做的优化

1. **用满三个 NPU 核**。测试代码中：

   ```python
   ret = rknn.init_runtime(core_mask=RKNNLite.NPU_CORE_0)
   ```

   仅使用了单核，而 RK3588 拥有三个 NPU 核。在后续实现实时识别，或其它需要多路、多线程并发的推理时，可以改成下面这样，把当前吞吐量提升到三倍：

   ```python
   ret = rknn.init_runtime(core_mask=RKNNLite.NPU_CORE_0_1_2)
   ```

2. **把后处理挪出 CPU**。`tail.onnx` 和后处理目前跑在 CPU 上，合计 8.86 ms，占端到端约 18%。可以考虑在量化模型时把解码 / 部分后处理一并固化进 RKNN 模型，或者把 NMS 换成更快的实现。