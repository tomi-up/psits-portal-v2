import Swal from 'sweetalert2'

const BASE = {
  buttonsStyling: false,
  customClass: {
    popup: 'rounded-2xl font-sans',
    title: '!text-lg !font-semibold !text-slate-900',
    htmlContainer: '!text-sm !text-slate-500',
    confirmButton:
      'rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 transition mx-1',
    cancelButton:
      'rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition mx-1',
    denyButton:
      'rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 transition mx-1',
  },
}

export async function confirmAction(opts: {
  title: string
  text?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}): Promise<boolean> {
  const result = await Swal.fire({
    ...BASE,
    title: opts.title,
    text: opts.text,
    icon: opts.danger ? 'warning' : 'question',
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? 'Confirm',
    cancelButtonText: opts.cancelText ?? 'Cancel',
    customClass: {
      ...BASE.customClass,
      confirmButton: opts.danger
        ? BASE.customClass.denyButton
        : BASE.customClass.confirmButton,
    },
    reverseButtons: true,
  })

  return result.isConfirmed
}
