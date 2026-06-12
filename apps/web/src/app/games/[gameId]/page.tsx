import { GameRoom } from "@/components/GameRoom";

export const metadata = { title: "Game — Risk II Online" };

export default async function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return <GameRoom gameId={gameId} />;
}
