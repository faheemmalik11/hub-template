export const paintOneFrameBeforeContinuing = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
