import MusicApp from "../MusicApp";

export default function Page() {
  return <MusicApp tv partyCode={process.env.MIRC_PARTY_CODE ?? ""} />;
}
