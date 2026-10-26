import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md text-center">
      <div className="card">
        <p className="text-5xl" aria-hidden>
          ⛳
        </p>
        <h1 className="mt-4 text-2xl font-extrabold text-fairway-900">
          Page not found
        </h1>
        <p className="mt-2 text-fairway-600">
          That hole isn&apos;t on our course. Let&apos;s get you back to the clubhouse.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/" className="btn-primary">
            Home
          </Link>
          <Link to="/book" className="btn-secondary">
            Book a slot
          </Link>
        </div>
      </div>
    </div>
  );
}
