import { S } from '../../shared/strings';

export function Onboarding() {
  return (
    <div className="space-y-3 p-4">
      <h2 className="font-semibold">{S.onboarding.title}</h2>
      <p className="text-sm text-gray-600">{S.onboarding.body}</p>
      <button className="rounded bg-blue-600 px-3 py-2 text-white" onClick={() => chrome.runtime.openOptionsPage()}>{S.onboarding.openSettings}</button>
    </div>
  );
}
