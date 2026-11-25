/** Opens a date input's picker; where showPicker() isn't there, focusing the input does it. */
export function showPickerOf(input: HTMLInputElement) {
  try {
    input.showPicker()
  } catch {
    input.focus()
  }
}
