# 蛊生态模拟器（Gu Ecosystem Simulator）

一个本地运行的桌面模拟应用。多个独立“坛子”中的蛊虫会自动移动、觅食、战斗、升级与变异，重点体验系统自然涌现的随机性与演化过程。

**当前阶段**：第一阶段主力完成单个坛子生态模拟系统（核心玩法）。蛊王元系统仅在数据结构层面预留，暂不实现功能。

## 技术栈

- **Tauri v2** + **Vue 3** + **TypeScript** + **Canvas 2D**
- 所有核心模拟逻辑（移动、战斗、继承、变异、事件）均用纯 TypeScript 实现
- 干净依赖管理：推荐使用 **pnpm**（node_modules 形成项目级隔离，类似 Python venv）

## 运行方式（开发）

**前提**：
- Node.js 18+（推荐 20+）
- Rust 工具链（rustup）+ 对应平台 C++ 构建工具（Windows 需 Visual Studio Build Tools 或等效）
- 推荐包管理器：**pnpm**（或 npm）

**步骤**：

```powershell
# 1. 克隆
git clone https://github.com/JoChiho/Gu-Ecosystem-Simulator.git
cd Gu-Ecosystem-Simulator

# 2. 安装依赖（强烈推荐 pnpm，形成干净隔离环境）
pnpm install
# 如果没有 pnpm：先安装 pnpm（corepack 或 npm i -g pnpm），或临时使用 npm install

# 3. 启动桌面开发环境（首次会编译 Rust 侧，较慢）
pnpm tauri dev
# 或
npm run tauri:dev
```

启动后会打开桌面窗口。当前为脚手架，后续步骤会替换为完整的 Canvas 模拟界面。

## 构建生产版本

```powershell
pnpm tauri build
```

产物位于 `src-tauri/target/release/bundle/`（Windows 上通常为 .exe 或 .msi）。

构建后的 exe 可独立运行，无需 Node / Rust 环境。

## 控制说明（开发中实现）

- 播放 / 暂停
- 速度调节（0.5x ~ 8x）
- 重置种群
- 保存 / 加载当前坛子状态（.json 文件，通过原生对话框）
- 点击 Canvas 选中单个蛊虫查看详情
- 实时事件日志、统计面板

## 项目结构亮点（详见 ARCHITECTURE.md）

- `src/core/` — 纯 TS 领域逻辑（types, traits, combat, engine, environment）。**无 UI 依赖，可独立演进和测试**。
- `src/rendering/` — 仅负责 Canvas 绘制。
- `src/composables/` — Vue 与模拟引擎的桥接（生命周期、速度控制、序列化）。
- `src-tauri/` — 最小化桌面壳 + 权限配置。
- 依赖管理：pnpm（node_modules 隔离） + 未来 Python 可用 venv 说明。

## 依赖管理（干净隔离）

- **前端**：`pnpm install` 后 `node_modules` 完全本地，删除即清。完美类比 `python -m venv`。
- **Python 预留**（未来扩展）：在 `py/` 目录使用标准 venv：
  ```powershell
  cd py
  python -m venv .venv
  .\.venv\Scripts\Activate.ps1
  pip install -r requirements.txt
  ```
- 任何人 clone 仓库后执行 `pnpm install && pnpm tauri dev` 即可复现。

## 开发约定

- 代码使用严格 TypeScript。
- UI 文本使用中文，代码标识符与注释中英结合。
- 所有游戏规则只放在 `src/core/`。
- 持续维护根目录 `ARCHITECTURE.md`。

## Roadmap（按优先级）

1. 单坛子完整模拟（移动、觅食、回合制战斗、特质继承、升级变异、环境事件、可视化、保存加载）—— 当前主力
2. 多坛子 UI 支持（独立并行运行）
3. 蛊王元系统（数据结构已预留，功能后续）
4. 更多特质、更好视觉反馈、统计图表、导出

## 许可证

MIT（或按仓库实际 LICENSE）

---

**开始贡献 / 运行**：先阅读 [ARCHITECTURE.md](./ARCHITECTURE.md) 了解分层与文件职责，再 `pnpm tauri dev` 体验。
