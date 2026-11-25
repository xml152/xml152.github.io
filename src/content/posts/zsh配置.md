---
title: '个人 zsh 使用以及配置'
description: '在 Debian 13 上安装 oh-my-zsh、powerlevel10k 主题与自动建议/语法高亮插件的完整记录。'
published: 2026-11-25
category: 技术
tags: ['linux', 'shell', 'zsh']
cover: /covers/zsh.jpg
coverAlt: 'zsh 配置与记录'
pinned: true
---

最近在搞 RK3588，装好各种配置以后用 SSH 连接来搞开发还是挺方便的，但是用bash输命令时候总觉得有点不对劲。想了一下，应该是因为平时用的终端是 oh-my-zsh 美化后的状态，而不是原生的 bash。虽然没有必要，但既然如此就写一篇，给这块开发板安装 oh-my-zsh 美化一下终端。

## 安装 zsh 与 oh-my-zsh

我给板子安装的系统是 Debian 13，这里就直接用 Debian 做演示了：

```bash
# 安装 zsh
sudo apt install zsh

# 安装 oh-my-zsh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# 国内镜像
sh -c "$(curl -fsSL https://gitee.com/pocmon/ohmyzsh/raw/master/tools/install.sh)"

# 设置 zsh 为默认终端（新版在安装时似乎会提问是否设置为默认 shell，可忽略）
chsh -s /bin/zsh

# 重启设备确认情况
sudo reboot
```

## 安装主题与插件

### powerlevel10k 主题（国内镜像）

```bash
git clone --depth=1 https://gitee.com/romkatv/powerlevel10k.git \
  ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k
```

### zsh-autosuggestions（自动建议）

```bash
git clone https://github.com/zsh-users/zsh-autosuggestions \
  ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-autosuggestions

# 国内镜像
git clone --depth=1 https://gitee.com/mirrors/zsh-autosuggestions.git \
  ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
```

### zsh-syntax-highlighting（语法高亮）

```bash
git clone https://github.com/zsh-users/zsh-syntax-highlighting \
  ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting

# 国内镜像
git clone --depth=1 https://gitee.com/mirrors/zsh-syntax-highlighting.git \
  ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting
```

## 配置 .zshrc

编辑配置文件：

```bash
vim ~/.zshrc
```

设置主题：

```bash
ZSH_THEME="powerlevel10k/powerlevel10k"
```

启用插件：

```bash
plugins=(git zsh-autosuggestions extract web-search zsh-syntax-highlighting)
```

刷新环境变量：

```bash
source ~/.zshrc
```

刷新后根据 powerlevel10k 的指引一步步初始化即可。