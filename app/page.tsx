import { redirect } from "next/navigation";
import MusicApp from "./MusicApp";
import { readIdentity } from "./auth/session-cookie";

export default async function Home() {
  const identity = await readIdentity();
  if (!identity || identity.role !== "host") redirect("/login");
  return <MusicApp identity={identity} partyCode={process.env.MIRC_PARTY_CODE ?? ""} />;
}
