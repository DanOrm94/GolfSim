import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function HomePage() {
  const { user } = useAuth();
  return (
    <div className="space-y-12">
      <section className="overflow-hidden rounded-3xl bg-fairway-800 text-white">
        <div className="grid gap-8 p-8 sm:p-12 md:grid-cols-2 md:items-center">
          <div className="space-y-5">
            <span className="badge bg-sand-200 text-fairway-900">Open 24/7</span>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
              Your tee time, any time.
            </h1>
            <p className="text-lg text-fairway-100">
              Book our premium indoor golf simulator by the hour, day or night.
              One bay, one hour at a time, reserved just for you.
            </p>
            <div className="flex flex-wrap gap-3">
              {user ? (
                <Link to="/book" className="btn-primary bg-sand-400 text-fairway-900 hover:bg-sand-500">
                  Book a slot
                </Link>
              ) : (
                <Link to="/login" className="btn-primary bg-sand-400 text-fairway-900 hover:bg-sand-500">
                  Log in to book
                </Link>
              )}
              {user && (
                <Link to="/bookings" className="btn-secondary">
                  My bookings
                </Link>
              )}
            </div>
          </div>
          <div className="relative hidden h-64 md:block">
            <div className="absolute inset-0 flex items-center justify-center text-[11rem] leading-none opacity-90" aria-hidden>
              ⛳
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {[
          {
            title: "Round-the-clock access",
            body: "The simulator is available every hour of every day. Early birds and night owls alike.",
          },
          {
            title: "Simple hourly booking",
            body: "Pick a date, choose a free hour, confirm. Your slot is held the moment it is confirmed.",
          },
          {
            title: "Managed membership",
            body: "Accounts are created by our team. Ask an administrator for your username and password.",
          },
        ].map((f) => (
          <div key={f.title} className="card">
            <h2 className="font-bold text-fairway-900">{f.title}</h2>
            <p className="mt-2 text-sm text-fairway-600">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
