# 光标三件套 React 组件（参考实现）

整理自个人项目的通用组件，供任意页面复用；Skill 文档见 `skill/cursor-effects-skill.md`。

| 组件 | 效果 | 关键参数 |
|---|---|---|
| `CustomCursor.jsx` | 图片光标：跟随、悬停放大、离窗隐藏 | `imageSrc` / `size`(64) / `scale`(1.5) |
| `CursorTrail.jsx` | 拖尾：发光圆点缩小淡出 | `color` / `size`(16) / `duration`(800) |
| `ClickRipple.jsx` | 点击波纹：圆环扩散淡出，连点叠加 | `color` / `maxSize`(120) / `duration`(1000) / `borderWidth`(2) |

## 用法

```jsx
// 父容器 relative；全局 CSS 加：* { cursor: none !important; }
<div className="relative min-h-screen">
  <CustomCursor imageSrc="光标图URL.png" size={64} scale={1.5} />
  <CursorTrail color="rgba(255,255,255,0.8)" size={16} duration={800} />
  <ClickRipple color="rgba(255,255,255,0.8)" maxSize={120} duration={1000} />
</div>
```

## 注意事项

1. 三者都要求 `pointer-events: none`（波纹层必须，否则点完按钮失效）
2. 拖尾/波纹的容器坐标用 `getBoundingClientRect()` 换算；DSH 插件版是全屏 fixed 层，无需换算
3. 移动端：`@media (hover: none)` 隐藏特效并恢复 `cursor: auto`
