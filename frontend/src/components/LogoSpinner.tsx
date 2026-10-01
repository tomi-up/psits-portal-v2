export default function LogoSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 font-sans dark:bg-slate-950">
      <img src="/psits-logo.png" alt="PSITS" className="h-16 w-16 animate-spin-slow" />
    </div>
  )
}
