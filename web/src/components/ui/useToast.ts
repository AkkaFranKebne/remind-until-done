import { Toast } from '@base-ui/react/toast'

/** Show a toast: success("Finally. Done.") or error("Something went wrong. Try again in a moment."). Needs ToastProvider. */
export function useToast() {
  const { add } = Toast.useToastManager()
  return {
    success: (title: string) => add({ title, type: 'success' }),
    error: (title: string) => add({ title, type: 'error' }),
  }
}
