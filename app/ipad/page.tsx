import { redirect } from "next/navigation";
import MusicApp from "../MusicApp";
import { readIdentity } from "../auth/session-cookie";

export default async function Page() {
  const identity = await readIdentity();
  if (!identity || identity.role !== "host") redirect("/login");
  return <MusicApp ipad identity={identity} partyCode={process.env.MIRC_PARTY_CODE ?? ""} />;
}
