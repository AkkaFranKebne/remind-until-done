/**
 * Google's official "G", as an image (public/google-g.svg), for the Continue with
 * Google button. Brand marks are the one exception to "icons come from Lucide"
 * (Design Inventory → Icons → Brand logos). Fits Button's icon slot.
 */
export function GoogleIcon({ size = 20 }: { size?: number }) {
  // alt="": the button text already says "Google".
  return <img src="/google-g.svg" alt="" width={size} height={size} />
}
