import { createClient } from "@sanity/client"

export const sanity = createClient({
  projectId: "n6ws3b8n",
  dataset: "production",
  apiVersion: "2024-01-01",
  useCdn: true,
})
