import { auth } from "@/auth";
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
        <p className="muted">2–6 players sharing one device. No account needed.</p>
        <a href="/play">
          <button className="primary">Start a hot-seat game</button>
        </a>
      </div>

      {session?.user ? (
        <>
          <CreateGameForm />
          <MyGames />
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
