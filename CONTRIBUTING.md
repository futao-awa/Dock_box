# 贡献指南

欢迎提交可复现的问题、功能建议、文档修正和代码改进。

## 开始之前

- 检查已有 Issues 和 Pull Requests，避免重复工作。
- 较大功能或系统集成改动，建议先通过 Issue 说明使用场景与实现范围。
- 保持一次 PR 的目标明确，分开功能、重构和无关格式修改。

## 本地开发

Fork 仓库后克隆你的副本，创建工作分支：

```powershell
git clone https://github.com/<你的用户名>/Dock_box.git
cd Dock_box
git switch -c fix/your-change
npm ci
npm run dev
```

需要 Node.js 22.16+。真实桌面和原生组件测试需要 Windows，网页预览可以用于布局与文案修改。目录职责见 [架构说明](docs/ARCHITECTURE.md)。

## 改动原则

- 新增配置字段时，同时维护默认值、类型、边界校验、界面与导入行为。
- 保持配置向后兼容，避免因新增字段丢失已有应用、分类或自定义图标。
- 应用启动通过主进程校验；不要把任意命令执行或远程网页权限暴露给渲染进程。
- 系统效果必须有退出 / 断开时的释放路径。涉及 UAC 的操作应说明取消授权时的行为。
- 中文路径、空格、快捷方式参数和多屏 DPI 都是支持场景，不能只验证英文路径。
- 界面改动提供截图；新的 Windows 行为说明验证系统和未覆盖的情况。

## 验证

```powershell
npm run typecheck
npm test
npm run build
```

窗口、IPC 或启动相关改动，按范围运行 `npm run test:desktop` 和 `npm run test:launch`。`test:launch` 仅启动本地测试程序；`test:desktop` 使用隔离配置并抑制外部启动与系统修改。

`npm run test:native` 会短暂切换桌面图标并恢复，需要交互式 Windows 桌面。任务栏、圆角、自启、U 盘与防火墙仍需按 [TESTING.md](TESTING.md) 人工验证。

## 提交与 PR

提交信息使用中文，格式为 `类型: 简要描述`：

| 类型 | 用途 | 示例 |
| --- | --- | --- |
| `feat` | 新功能 | `feat: 增加透明堆叠分类列表` |
| `fix` | 问题修复 | `fix: 修复中文路径启动失败` |
| `refactor` | 重构 | `refactor: 统一窗口路由处理` |
| `style` | 样式调整 | `style: 优化控制中心文字对比度` |
| `docs` | 文档更新 | `docs: 补充安装和验证说明` |

先检查并暂存相关文件，再提交和推送自己的分支：

```powershell
git diff --check
git add <相关文件>
git commit -m "fix: 简要描述改动"
git push -u origin fix/your-change
```

不提交 `.env`、密钥、私人配置、日志、依赖目录、缓存或打包产物。PR 描述应解释问题、最终行为、验证结果及系统兼容性边界。贡献的代码与文档按本仓库的 MIT 许可证发布。
