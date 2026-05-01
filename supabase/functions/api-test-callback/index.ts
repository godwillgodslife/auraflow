import { handleTestCallbackRequest } from "../_shared/auraflow.ts";

Deno.serve((request) => handleTestCallbackRequest(request));
