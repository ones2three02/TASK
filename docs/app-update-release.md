# TASK 应用内更新发布说明

TASK 桌面端使用 Tauri v2 updater。应用内更新依赖 GitHub Release 上的 `latest.json` 和已签名安装包。

## 当前工作流

- `.github/workflows/desktop-build.yml`：日常打包验证，推送到 `dev/main` 后生成 macOS 和 Windows 的 Actions artifacts，不用于应用内更新。
- `.github/workflows/app-release.yml`：正式应用发布，推送 `v*` tag 或手动触发后生成 GitHub Release、安装包和 updater artifacts。
- `src-tauri/tauri.release.conf.json`：只在正式发布时开启 `bundle.createUpdaterArtifacts`，避免本地普通打包要求 updater 私钥。

## 首次配置 updater 密钥

Tauri updater 要求安装包签名，且签名不能关闭。`src-tauri/tauri.conf.json` 中的 `plugins.updater.pubkey` 必须和 GitHub Secret 里的私钥配对。

如果没有原项目私钥，应生成 TASK 自己的 updater key：

```bash
pnpm tauri signer generate -- -w ~/.tauri/task-updater.key
```

把命令输出的 public key 写入：

```text
src-tauri/tauri.conf.json -> plugins.updater.pubkey
```

然后把 private key 以 base64 形式写入 GitHub Secrets：

```bash
KEY_B64="$(base64 < ~/.tauri/task-updater.key | tr -d '\r\n')"
gh secret set TAURI_SIGNING_PRIVATE_KEY_BASE64 --repo ones2three02/TASK --body "$KEY_B64"
```

如果生成 key 时设置了密码，还需要添加：

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo ones2three02/TASK --body "<your-key-password>"
```

不要提交 private key，不要把 private key 发到聊天或文档里。

## 发布一个可应用内更新的版本

1. 更新应用版本，至少包括 `src-tauri/tauri.conf.json` 和 `package.json`。
2. 提交并推送到 `main` 或发布分支。
3. 创建并推送版本 tag：

```bash
git tag v0.5.33
git push origin v0.5.33
```

4. 等待 GitHub Actions 的 `App Release` 完成。
5. 确认 GitHub Release 中存在 `latest.json` 和对应平台安装包。

客户端会通过以下 endpoint 检查更新：

```text
https://github.com/ones2three02/TASK/releases/latest/download/latest.json
```

## 注意事项

- Draft release 不会被 `/releases/latest` 作为最新版本使用，因此 `App Release` 会直接发布非 draft release。
- 应用版本必须递增，否则客户端不会认为有新版本。
- 如果更换 updater key，已经安装旧版本的用户只能更新到使用旧 key 签名的版本；因此首次正式发布前要确认 key 配置正确。
