import { state } from "../../core/state";

export async function handleState(req, res) {
  respond(res, 200, {
    blocked: [...state.blockedIps.entries()],
    settings: state.settings
  });
}
