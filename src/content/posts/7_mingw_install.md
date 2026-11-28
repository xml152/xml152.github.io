---
title: 'Windows 下用 VS Code 开发 C/C++：MinGW-w64 环境搭建'
description: '面向新同学的入门指南：从 MinGW-w64（WinLibs）下载解压、配置环境变量，到安装 VS Code 与 C/C++ 插件，最后用 CMake Tools 快速创建、编译和调试第一个 C 程序。'
published: 2026-11-28
category: 基础
tags: ['C', 'C++', 'vscode', 'windows', '入门']
cover: /covers/mingw-vscode.png
coverAlt: '深色背景中央的 C/C++ 圆形徽章，下方为文章标题「Windows 下用 VS Code 开发 C/C++」'
pinned: true
---

这篇文章并不是给我自己看的。截至 2026 年我还在学校实验室狠狠攻击自己的电脑，但新同学已经又来了一轮，很多几乎不碰电脑的同学或者刚入学的来问我「XXX 怎么安装」这类问题。倒不是不愿意解答，只是一个个说明太麻烦，干脆写一篇文章，谁来了看我的文档就行，节省彼此的时间。

## 为什么用 VS Code？

众所周知高校教学具有滞后性，很多大学还在用古老的 VC 6.0 做教学，好一点的用 Dev-C++。道理我懂，但这真的太老了。总之，下面我会在虚拟机里展示完整的安装过程和使用方式。

## 1. 安装 MinGW-w64

MinGW（Minimalist GNU for Windows）是一套在 Windows 上使用 GNU 工具链（如 GCC、G++、GDB）编译原生 Windows 程序的开源开发环境，能生成无需额外依赖 DLL 的纯 Windows 可执行文件（`.exe` / `.dll`）。而 MinGW-w64 是 MinGW 的现代分支，支持 32/64 位 Windows、更多线程模型（win32、posix、mcf）和更完整的 C/C++ 标准库。

搜索 `mingw-w64` 就能找到 [MinGW-w64 官网](https://www.mingw-w64.org/)。

点击 `Download` → `Pre-built Toolchains`，可以找到预构建的工具包：

![MinGW-w64 官网的 Download → Pre-built Toolchains 页面](/covers/mingw/download1.png)

右侧的 w64devkit 和 WinLibs 都是 Windows 下可用的工具包，本文使用 WinLibs 作为演示。点击按钮跳转到下载界面：

![Pre-built Toolchains 中的 WinLibs 下载入口](/covers/mingw/download2.png)

下滑找到最新版的按钮，点击下载即可：

![WinLibs 最新版本的下载按钮](/covers/mingw/download3.png)

如果下载缓慢，也可以找镜像源，比如[兰州大学开源社区镜像站](https://mirror.lzu.edu.cn/github-release/brechtsanders/winlibs_mingw/LatestRelease/)，点击对应版本下载：

![兰州大学镜像站中的版本列表](/covers/mingw/download4.png)

下载后把压缩包解压即可。我这里为了演示放在了 C 盘根目录，实际更建议放在其它位置，并且路径里尽量不要有中文和空格：

![解压后的 mingw64 文件夹](/covers/mingw/unzip.png)

## 2. 配置环境变量

直接在 Windows 搜索框搜索「系统环境变量」：

![Windows 搜索「系统环境变量」](/covers/mingw/path1.png)

按照图中所示，新增解压后文件夹里 `bin` 目录的路径，然后一路点击三次「确定」退出：

![在 Path 中新增 bin 目录](/covers/mingw/path2.png)

在 cmd 或 PowerShell 里输入 `gcc --version`，能显示版本号就说明配置成功：

```powershell
gcc --version
```

![gcc --version 输出版本号](/covers/mingw/path3.png)

## 3. 安装 VS Code

搜索 VS Code，进入[官网](https://code.visualstudio.com/)，点击 `Download for Windows`：

![VS Code 官网的 Download for Windows 按钮](/covers/mingw/vsdownload1.png)

下载安装包后自行安装即可：

![VS Code 安装向导](/covers/mingw/vsdownload2.png)

## 4. 配置插件

### C/C++ 插件

打开 VS Code，在左侧扩展面板搜索 `C/C++ Extension Pack` 并安装：

![搜索并安装 C/C++ Extension Pack](/covers/mingw/extension1.png)

也可以单独安装图中的三个插件，因为整合包里的 `C/C++ Themes` 只是个主题包，可以不装：

![C/C++ Extension Pack 包含的三个插件](/covers/mingw/extension2.png)

### 汉化插件（可选）

搜索 `Chinese`，安装图中第一个插件：

![搜索 Chinese 中文语言包](/covers/mingw/extension3.png)

安装后根据右下角提示重启 VS Code，就可以用中文界面了：

![右下角重启 VS Code 的提示](/covers/mingw/extension4.png)

## 5. 愉快地使用

我在桌面新建了一个文件夹，取名 `c_test`，如图用 VS Code 打开：

![用 VS Code 打开 c_test 文件夹](/covers/mingw/test_code1.png)

如果提示「受限」，按图选择信任：

![选择信任此文件夹](/covers/mingw/test_code2.png)

此时按住 `Ctrl+Shift+P`，在弹出的命令面板输入并选择 `CMake: Quick Start`。随后会询问项目名称，直接敲回车或者输入其它内容均可：

![命令面板与项目名称输入](/covers/mingw/test_code3.png)

根据需要选择 C 或者 C++ 项目，这里我选了 C：

![选择 C 或 C++ 项目类型](/covers/mingw/test_code4.png)

选择创建可执行文件：

![选择创建可执行文件](/covers/mingw/test_code5.png)

其余选项直接点确定即可：

![其余选项直接确认](/covers/mingw/test_code6.png)

随后「添加新预设」→「从编译器创建」，如果列表里有我们下载的 MinGW 编译器，直接选择即可：

![添加新预设，从编译器创建](/covers/mingw/test_code7.png)

如果没有，就点击「以递归方式扫描」，然后选择 MinGW 的 `bin` 目录：

![递归扫描并选择 mingw 的 bin 目录](/covers/mingw/test_code8.png)

扫描结束后，在左侧点击 CMake 图标，选择我们的 MinGW 工具包：

![在 CMake 视图中选择 mingw 工具包](/covers/mingw/test_code9.png)

一切完毕后，点击左下角的生成、调试和运行按钮即可：

![VS Code 左下角的生成、调试和运行按钮](/covers/mingw/test_code10.png)

## 小结

- **编译器**：从官网或镜像下载 WinLibs 版 MinGW-w64，解压即可，无需安装。
- **环境变量**：把解压目录下的 `bin` 加进 `Path`，用 `gcc --version` 验证。
- **VS Code**：装好 `C/C++ Extension Pack`，中文语言包按需安装。
- **第一个程序**：`CMake: Quick Start` 建项目 → 从编译器创建预设 → 选 MinGW 工具包 → 生成、调试、运行。
