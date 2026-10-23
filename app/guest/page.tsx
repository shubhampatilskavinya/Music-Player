import { authConfigured } from "../auth/identity";
import { readIdentity } from "../auth/session-cookie";
import JoinForm from "./JoinForm";
import GuestConsole from "./GuestConsole";

export default async function GuestPage() {
  if (!authConfigured()) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>Mirc Beats</h1>
          <p className="embed-notice" role="alert">The party is not configured yet. Ask the host to set it up.</p>
        </div>
      </div>
    );
  }
  const identity = await readIdentity();
  if (!identity || identity.role !== "guest") return <JoinForm />;
  return <GuestConsole name={identity.name} id={identity.id} />;
}
