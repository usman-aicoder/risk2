import { auth } from "@/auth";
import { EnableNotifications } from "@/components/EnableNotifications";
import { CreateGameForm, MyGames } from "@/components/Home";

export default async function HomePage() {
  let session = null;
  try {
    session = await auth();
  } catch {
    // No DATABASE_URL/AUTH_SECRET configured (e.g. local hot-seat only).
  }

  return (
    <main className="page">
      <h1>Risk II Online</h1>
      <p className="muted">
        A faithful remake of the classic — take your turn, get notified when it&apos;s yours again.
      </p>

      <div className="panel">
        <h3>Play right now</h3>
        <p className="muted">
          New to Risk? The tutorial walks you through one full turn. Hot-seat games support 2–6
          humans and bots on one device. No account needed.
        </p>
        <div className="row">
          <a href="/tutorial">
            <button className="primary">Take the tutorial</button>
          </a>
          <a href="/play">
            <button>Start a hot-seat game</button>
          </a>
        </div>
      </div>

      {session?.user ? (
        <>
          <CreateGameForm />
          <MyGames />
          <EnableNotifications />
        </>
      ) : (
        <div className="panel">
          <h3>Play online</h3>
          <p className="muted">Sign in to create async games and invite friends.</p>
          <a href="/api/auth/signin">
            <button>Sign in</button>
          </a>
        </div>
      )}
    </main>
  );
}
