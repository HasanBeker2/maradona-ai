export function buildVoiceTaskExtractionPrompt(transcript: string): string {
  return `You are an AI assistant that extracts tasks from a voice message transcript.

Transcript:
"${transcript}"

Extract ALL tasks mentioned and return ONLY valid JSON:
{
  "tasks": [
    {
      "title": string,
      "assignee_name": string | null,
      "due_date_text": string | null
    }
  ],
  "needs_clarification": boolean,
  "clarification_question": string | null
}

Rules:
- Extract every task/action item mentioned, each as a separate object in "tasks"
- title: concise task description
- assignee_name: person's name if mentioned, null otherwise
- due_date_text: raw date string if mentioned (e.g. "Friday", "cuma", "03.05.2026"), null otherwise
- needs_clarification: true only if the transcript is completely unclear
- If no tasks found, return tasks: []

Return ONLY the JSON object, no markdown, no explanation.`;
}
