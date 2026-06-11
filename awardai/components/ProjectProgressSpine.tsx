'use client'
// ─────────────────────────────────────────────────────────────────────────────
// ProjectProgressSpine — Session 54 (Build 1, Brief-Onboarding-Engagement-v3 §6)
//
// Persistent per-project workflow state bar, rendered above the workspace
// tabs. Navigation + state, NOT help: it does not respect the guidance
// toggle and stays on for everyone (it is also the power user's fastest
// tab map).
//
// Deploys to: components/ProjectProgressSpine.tsx
//
// Rules:
//   • Props-driven only — this component does NO data access of its own.
//     Step state is derived by the page from data it already loads under
//     the Session 52 payload diet. Never add a fetch here.
//   • Every step is clickable (switches tab via onStepClick). Filled steps
//     show a one-datum summary (count, generation, score). Empty steps
//     show ○ and land on that tab's empty state.
//   • Mobile: horizontal scroll within the bar, tap targets ≥ 44px,
//     no hover-dependent content (platform device rule).
// ─────────────────────────────────────────────────────────────────────────────

export type SpineStep = {
  key: string          // step id, logged in spine_step_clicked context
  label: string        // display label
  done: boolean        // filled (✓) vs empty (○)
  summary?: string     // one-datum summary shown when done, e.g. "4", "Gen 2", "6.8"
}

type Props = {
  steps: SpineStep[]
  activeKey?: string                 // step whose tab is currently open
  onStepClick: (step: SpineStep) => void
}

export default function ProjectProgressSpine({ steps, activeKey, onStepClick }: Props) {
  return (
    <div className="border-b border-gray-200 bg-white">
      <div
        className="w-full max-w-5xl mx-auto px-2 sm:px-6 flex items-center overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        role="navigation"
        aria-label="Project progress"
      >
        {steps.map((step, i) => (
          <div key={step.key} className="flex items-center shrink-0">
            {i > 0 && <span className="text-gray-300 text-xs px-1 select-none">·</span>}
            <button
              onClick={() => onStepClick(step)}
              title={step.done ? `Open ${step.label}` : `${step.label}: not started yet`}
              className={`flex items-center gap-1.5 px-2 sm:px-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
                activeKey === step.key
                  ? 'border-green-700 text-gray-900 font-medium'
                  : step.done
                    ? 'border-transparent text-gray-600 hover:text-gray-900'
                    : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}
              style={{ minHeight: '44px' }}
            >
              <span
                aria-hidden="true"
                className={step.done ? 'text-green-700' : 'text-gray-300'}
              >
                {step.done ? '✓' : '○'}
              </span>
              <span className={step.done ? 'font-medium' : ''}>{step.label}</span>
              {step.done && step.summary && (
                <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full leading-none">
                  {step.summary}
                </span>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
