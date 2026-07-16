/**
 * THE canonical brain-install command. Both places that show it
 * (dashboard OnboardingFlow + /byob Creator) import this builder, so the
 * command can never drift between them again — the dashboard copy once
 * shipped a broken worker.py path for weeks precisely because the two
 * surfaces maintained separate strings.
 *
 * Deliberately lean + auditable (no curl|bash, no skill registration):
 * clone the public repo, install the two Python deps the worker + bridges
 * need, write the key, run the worker against the hosted broker.
 */
export function brainInstallCommand(key: string): string {
  return `git clone https://github.com/pattern-ai-labs/gstack-joins-meeting ~/gstack-joins-meeting 2>/dev/null || git -C ~/gstack-joins-meeting pull --ff-only
python3 -m pip install -q aiohttp websockets
mkdir -p ~/.gstack && echo '{"worker_key":"${key}"}' > ~/.gstack/worker.json && chmod 600 ~/.gstack/worker.json
GSTACK_BROKER_URL=wss://gstack-broker.fly.dev/v1/workers/connect python3 ~/gstack-joins-meeting/hosted/worker.py`;
}
