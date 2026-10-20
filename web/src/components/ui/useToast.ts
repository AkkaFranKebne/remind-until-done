import { Toast } from '@base-ui/react/toast'

/** Show a toast: success("Finally. Done.") or error("Couldn't save. Try again."). Needs ToastProvider. */
export function useToast() {
  const { add } = Toast.useToastManager()
  return {
    success: (title: string) => add({ title, type: 'success' }),
    error: (title: string) => add({ title, type: 'error' }),
  }
}
