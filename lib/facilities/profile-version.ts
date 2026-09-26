import { ActionError } from "@/lib/actions/auth";

// The client sent a profile version older than the stored one: the page was
// loaded before another save/completion (second tab, Back navigation). The
// form turns this into a reload prompt; other 409s (e.g. a locked profile)
// keep their own message.
export class ProfileVersionConflictError extends ActionError {
  constructor(message: string) {
    super(message, 409);
  }
}
