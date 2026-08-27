import { Link } from 'react-router-dom'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 font-sans text-center">
      <img src="/psits-logo.png" alt="PSITS" className="h-16 w-16" />

      <div className="h-56 w-56">
        <DotLottieReact
          src="https://lottie.host/6cc9c291-6189-49ec-a309-ca0f2325b510/wyb5Sw5Ysz.lottie"
          loop
          autoplay
        />
      </div>

      <h1 className="text-2xl font-semibold text-slate-900">Oops, we're still building the landing page</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        But you can log in now, hehe. Expect some bugs along the way — feel free to report anything to{' '}
        <a href="mailto:tstabol@up.edu.ph" className="font-medium text-sky-600 hover:text-sky-700">
          tstabol@up.edu.ph
        </a>
        , tnx &lt;3
      </p>

      <Link
        to="/login"
        className="mt-6 rounded-xl bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
      >
        Log In
      </Link>
    </div>
  )
}
