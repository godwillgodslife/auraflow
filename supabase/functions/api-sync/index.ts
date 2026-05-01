import { handleSyncRequest } from "../_shared/auraflow.ts";

Deno.serve((request) => handleSyncRequest(request));
