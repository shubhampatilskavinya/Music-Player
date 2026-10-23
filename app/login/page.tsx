import { authConfigured } from "../auth/identity";
import { MusicNoteIcon } from "../icons";
import PinForm from "./PinForm";

export default function LoginPage() {
  if (!authConfigured()) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-mark"><span className="brand-mark"><MusicNoteIcon /></span></div>
          <h1>Mirc <span className="brand-second">Beats.</span></h1>
          <p className="embed-notice" role="alert">Login is not configured. Set MIRC_HOST_PIN, MIRC_SESSION_SECRET and MIRC_PARTY_CODE in the server environment, then redeploy.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-mark"><span className="brand-mark"><MusicNoteIcon /></span></div>
        <h1>Mirc <span className="brand-second">Beats.</span></h1>
        <p className="login-subtitle">Enter the host PIN to control the party.</p>
        <PinForm />
        <p className="login-guest-link">Joining a party instead? <a href="/guest">Enter the party code</a></p>
      </div>
    </div>
  );
}
