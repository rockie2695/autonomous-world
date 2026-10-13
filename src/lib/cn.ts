/**
 * 合併 className，把 false / null / undefined 的部分拿掉。
 * Join class names, dropping the false / null / undefined parts.
 *
 * 目前沒引入 clsx / tailwind-merge：對本頁的用法就足夠。Tailwind 的相斥類別會直接依 CSS
 * 源順序，而不是參數先後。若以後真的遇到矛盾的類別（例如同一個元素同時接受 bg-white/5
 * 與 bg-cyan-400/10），那才是 tailwind-merge 該登場的時候；目前沒有。
 * No clsx / tailwind-merge dependency: this is enough for how the project actually uses it.
 * Tailwind resolves conflicting utilities by CSS source order rather than argument order,
 * so if genuinely conflicting classes ever appear (the same element taking both
 * bg-white/5 and bg-cyan-400/10), that is when tailwind-merge earns its place.
 *
 * @param inputs - 任意種類的 class 字串 / class strings of any kind
 * @returns 去掉空白後的 className / the className with the blanks removed
 */
export function cn(
  ...inputs: Array<string | false | null | undefined>
): string {
  return inputs
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' ');
}