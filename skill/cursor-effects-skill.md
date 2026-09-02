# 鼠标光标三件套 Skill：自定义光标 / 拖尾 / 点击波纹

> 用途：将默认鼠标光标替换为自定义图片，并叠加鼠标拖尾轨迹与点击水波纹效果。
> 三个组件互不依赖，可按需组合；配套 React 组件见 `cursor-components/`。

## 一、核心原理

1. **隐藏系统默认光标**：通过 CSS `cursor: none !important` 全局隐藏。
2. **跟随鼠标的图片元素**：`position: fixed` 的 div 监听 `mousemove`，坐标同步为 `clientX/Y`。
3. **居中定位**：`transform: translate(-50%, -50%)` 让图片中心对准指针。
4. **交互增强**：悬停链接/按钮时放大；鼠标离开窗口时隐藏。
5. **拖尾/波纹都是"时间驱动"**：事件只负责记录点（坐标 + `createdAt`），
   `requestAnimationFrame` 每帧按 `(now - createdAt) / duration` 计算存活进度，
   用缓出函数 `1 - (1-p)^3` 演化尺寸/透明度，过期即销毁。

## 二、CustomCursor（图片光标）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `imageSrc` | 必填 | 光标图片 URL（建议透明底 PNG，64x64 左右，主体居中） |
| `size` | 64 | 光标尺寸 px |
| `scale` | 1.5 | 悬停可点击元素时放大倍数 |

要点：`pointer-events:none`；高 z-index；`cursor:none !important`；`clientX/Y` 配 `position:fixed` 无需滚动偏移；卸载时移除监听；移动端 `@media (hover:none)` 恢复原生光标。

## 三、CursorTrail（拖尾轨迹）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `color` | `rgba(255,255,255,0.8)` | 光点颜色（含光晕） |
| `size` | 16 | 光点初始尺寸 px |
| `duration` | 800 | 存活时长 ms |

要点：坐标换算用 `getBoundingClientRect()`（相对容器）；节流 16ms/个；上限 12 个；
rAF 驱动、数据放 ref 每帧同步一次；缓出函数是"余韵消散"感的灵魂；与光标叠加时注意 z-index。

## 四、ClickRipple（点击波纹）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `color` | `rgba(255,255,255,0.8)` | 波纹颜色 |
| `maxSize` | 120 | 最大扩散尺寸 px |
| `duration` | 1000 | 存活时长 ms |
| `borderWidth` | 2 | 圆环边框粗细 px |

要点：波纹层 `pointer-events:none`（否则点完按钮失效）；`document` 级 `click` 监听（子组件无需逐个绑定）；数据 ref + rAF；卸载清理；居中 `left: x - size/2`；支持连点叠加。

## 五、完整实现清单

✅ 光标图片平滑跟随　✅ 悬停放大 1.5×　✅ 离开窗口隐藏/进入恢复
✅ 全局隐藏系统光标　✅ 拖尾发光圆点缩小淡出（颜色/尺寸/时长可配）
✅ 点击波纹扩散圆环（颜色/尺寸/时长/边框可配）✅ 组件化即插即用

## 六、工程化踩坑记录

1. `pointer-events: none` 必须，否则挡住下层点击/悬停。
2. z-index 要高于应用内所有面板（含 dsh-skin 这类 2147483000 级 overlay）。
3. `cursor: none` 用 `!important`，输入框/文本域保留 I-beam。
4. 动画与事件分离：事件写 ref，rAF 每帧同步 state；`useEffect` 清理函数里
   `cancelAnimationFrame` + 移除监听。
5. 缓动用 easeOutCubic，线性会很生硬。
6. 拖尾点/波纹都要有过期过滤与数量上限，防无限增长。
7. 触屏设备：`@media (hover: none)` 隐藏特效层并恢复 `cursor: auto`。
