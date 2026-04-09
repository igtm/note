import { createDefaultItemStyle, legacyTextToContent, type CanvasItem, type ItemStyle, type ItemType } from './notebook'

export type NotebookTemplateCategory = 'business' | 'engineering' | 'education'

export type NotebookTemplate = {
  id: string
  name: string
  description: string
  highlights: string[]
  buildItems: () => CanvasItem[]
}

export type NotebookTemplateSection = {
  id: NotebookTemplateCategory
  label: string
  templates: NotebookTemplate[]
}

type TemplateTextItemType = Exclude<ItemType, 'path' | 'image'>

type TemplateTextSpec = {
  slug: string
  type: TemplateTextItemType
  x: number
  y: number
  w: number
  h: number
  text: string
  style?: Partial<ItemStyle>
}

const warmPanel = '#fff8e8'
const coolPanel = '#edf4ff'
const greenPanel = '#eef7ea'
const blushPanel = '#ffe7df'
const ink = '#5b4826'
const mutedStroke = '#8f6b2b'

const titleStyle: Partial<ItemStyle> = {
  color: 'transparent',
  stroke: 'transparent',
  fontFamily: 'sans',
  fontSize: 'lg',
  textAlign: 'left',
}

const panelStyle: Partial<ItemStyle> = {
  color: warmPanel,
  stroke: ink,
  strokeWidth: 'thin',
  fontFamily: 'sans',
  textAlign: 'left',
}

const noteStyle: Partial<ItemStyle> = {
  stroke: mutedStroke,
  textAlign: 'left',
}

const accentStyle: Partial<ItemStyle> = {
  color: coolPanel,
  stroke: '#4e6c88',
  strokeWidth: 'thin',
  fontFamily: 'sans',
  textAlign: 'left',
}

const successStyle: Partial<ItemStyle> = {
  color: greenPanel,
  stroke: '#567a44',
  strokeWidth: 'thin',
  fontFamily: 'sans',
  textAlign: 'left',
}

const alertStyle: Partial<ItemStyle> = {
  color: blushPanel,
  stroke: '#9d5b52',
  strokeWidth: 'thin',
  fontFamily: 'sans',
  textAlign: 'left',
}

const buildTemplate = (prefix: string, specs: TemplateTextSpec[]) => {
  let counter = 0
  const nextId = (slug: string) => `${prefix}-${slug}-${++counter}`

  return specs.map(
    (spec) =>
      ({
        id: nextId(spec.slug),
        type: spec.type,
        x: spec.x,
        y: spec.y,
        w: spec.w,
        h: spec.h,
        content: legacyTextToContent(spec.text),
        ...createDefaultItemStyle(spec.type),
        ...spec.style,
      }) as CanvasItem,
  )
}

const meetingNotesTemplate: NotebookTemplate = {
  id: 'meeting-notes',
  name: 'Meeting Notes',
  description: 'A structured board for weekly check-ins, client meetings, and stakeholder reviews.',
  highlights: ['Agenda and context', 'Decisions and risks', 'Action list with owners'],
  buildItems: () =>
    buildTemplate('meeting', [
      {
        slug: 'title',
        type: 'text',
        x: 120,
        y: 72,
        w: 640,
        h: 72,
        text: 'Meeting Notes',
        style: titleStyle,
      },
      {
        slug: 'meta',
        type: 'rect',
        x: 840,
        y: 78,
        w: 360,
        h: 104,
        text: 'Date:\nParticipants:\nOwner:\nMeeting goal:',
        style: accentStyle,
      },
      {
        slug: 'agenda',
        type: 'note',
        x: 120,
        y: 188,
        w: 320,
        h: 286,
        text: 'Agenda\n\n- Wins since last week\n- Decisions needed\n- Risks and blockers\n- Next commitments',
        style: noteStyle,
      },
      {
        slug: 'discussion',
        type: 'note',
        x: 470,
        y: 188,
        w: 320,
        h: 286,
        text: 'Discussion Notes\n\n- Key context\n- Data points\n- Open questions\n- Tradeoffs to revisit',
        style: noteStyle,
      },
      {
        slug: 'actions',
        type: 'note',
        x: 820,
        y: 188,
        w: 380,
        h: 286,
        text: 'Action Items\n\n- [ ] Task / owner / due date\n- [ ] Task / owner / due date\n- [ ] Follow-up item',
        style: noteStyle,
      },
      {
        slug: 'decisions',
        type: 'rect',
        x: 120,
        y: 510,
        w: 500,
        h: 236,
        text: 'Decisions\n\n1. Decision made\n2. Why it was chosen\n3. What changes next',
        style: panelStyle,
      },
      {
        slug: 'risks',
        type: 'rect',
        x: 650,
        y: 510,
        w: 550,
        h: 236,
        text: 'Risks / Follow-up\n\n- Dependency or blocker\n- Escalation needed\n- What must be reviewed before the next meeting',
        style: alertStyle,
      },
    ]),
}

const projectBriefTemplate: NotebookTemplate = {
  id: 'project-brief',
  name: 'Project Brief',
  description: 'A one-page kickoff board for aligning scope, stakeholders, and delivery milestones.',
  highlights: ['Vision and audience', 'Scope and success metrics', 'Timeline and open questions'],
  buildItems: () =>
    buildTemplate('brief', [
      {
        slug: 'title',
        type: 'text',
        x: 120,
        y: 72,
        w: 640,
        h: 72,
        text: 'Project Brief',
        style: titleStyle,
      },
      {
        slug: 'vision',
        type: 'note',
        x: 120,
        y: 180,
        w: 320,
        h: 236,
        text: 'Vision\n\nWhat change should this project create for customers or the business?',
        style: noteStyle,
      },
      {
        slug: 'audience',
        type: 'rect',
        x: 470,
        y: 180,
        w: 320,
        h: 236,
        text: 'Audience\n\n- Primary users\n- Internal stakeholders\n- Teams affected by launch',
        style: accentStyle,
      },
      {
        slug: 'scope',
        type: 'rect',
        x: 820,
        y: 180,
        w: 380,
        h: 236,
        text: 'Scope\n\nIn:\n- Deliverable\n- Deliverable\n\nOut:\n- Explicit non-goal',
        style: panelStyle,
      },
      {
        slug: 'metrics',
        type: 'rect',
        x: 120,
        y: 446,
        w: 360,
        h: 264,
        text: 'Success Metrics\n\n- Leading indicator\n- Lagging indicator\n- Decision date for success review',
        style: successStyle,
      },
      {
        slug: 'timeline',
        type: 'rect',
        x: 510,
        y: 446,
        w: 360,
        h: 264,
        text: 'Milestones\n\n1. Discovery / alignment\n2. Build and internal review\n3. Launch or pilot\n4. Measure and iterate',
        style: panelStyle,
      },
      {
        slug: 'questions',
        type: 'note',
        x: 900,
        y: 446,
        w: 300,
        h: 264,
        text: 'Open Questions\n\n- What is still uncertain?\n- What decision blocks execution?\n- Who needs to approve?',
        style: noteStyle,
      },
    ]),
}

const architectureReviewTemplate: NotebookTemplate = {
  id: 'architecture-review',
  name: 'Architecture Review',
  description: 'A systems sketch for discussing entry points, core services, data flows, and review risks.',
  highlights: ['System boundaries', 'Constraints and migration notes', 'Review questions'],
  buildItems: () =>
    buildTemplate('architecture', [
      {
        slug: 'title',
        type: 'text',
        x: 120,
        y: 72,
        w: 720,
        h: 72,
        text: 'Architecture Review',
        style: titleStyle,
      },
      {
        slug: 'clients',
        type: 'ellipse',
        x: 120,
        y: 184,
        w: 220,
        h: 140,
        text: 'Clients\n\nWeb\nMobile\nPartners',
        style: accentStyle,
      },
      {
        slug: 'edge',
        type: 'rect',
        x: 390,
        y: 164,
        w: 250,
        h: 180,
        text: 'Entry Layer\n\nAPI gateway\nJobs / schedulers\nAuth / rate limits',
        style: panelStyle,
      },
      {
        slug: 'core',
        type: 'rect',
        x: 700,
        y: 164,
        w: 280,
        h: 180,
        text: 'Core Services\n\nDomain logic\nAsync workers\nRules / orchestration',
        style: successStyle,
      },
      {
        slug: 'data',
        type: 'ellipse',
        x: 1030,
        y: 184,
        w: 220,
        h: 140,
        text: 'Data Stores\n\nPrimary DB\nCache\nSearch / events',
        style: panelStyle,
      },
      {
        slug: 'constraints',
        type: 'note',
        x: 120,
        y: 396,
        w: 330,
        h: 270,
        text: 'Constraints\n\n- Latency budget\n- Compliance requirements\n- Team ownership boundaries',
        style: noteStyle,
      },
      {
        slug: 'migration',
        type: 'note',
        x: 485,
        y: 396,
        w: 330,
        h: 270,
        text: 'Migration Plan\n\n1. Safe first step\n2. Dual-write or compatibility window\n3. Cutover and rollback plan',
        style: noteStyle,
      },
      {
        slug: 'review',
        type: 'rect',
        x: 850,
        y: 396,
        w: 400,
        h: 270,
        text: 'Review Questions\n\n- What is the highest-risk dependency?\n- Where does data ownership get fuzzy?\n- What should be load-tested or instrumented first?',
        style: alertStyle,
      },
    ]),
}

const incidentReviewTemplate: NotebookTemplate = {
  id: 'incident-review',
  name: 'Incident Review',
  description: 'A postmortem workspace for capturing impact, timeline, root cause, and follow-up actions.',
  highlights: ['Timeline and impact', 'Detection and root cause', 'Prevention tasks'],
  buildItems: () =>
    buildTemplate('incident', [
      {
        slug: 'title',
        type: 'text',
        x: 120,
        y: 72,
        w: 720,
        h: 72,
        text: 'Incident Review',
        style: titleStyle,
      },
      {
        slug: 'summary',
        type: 'rect',
        x: 120,
        y: 176,
        w: 300,
        h: 214,
        text: 'Summary\n\nSeverity:\nStart / end time:\nWho was impacted:\nCurrent status:',
        style: alertStyle,
      },
      {
        slug: 'timeline',
        type: 'note',
        x: 460,
        y: 176,
        w: 340,
        h: 214,
        text: 'Timeline\n\n1. Detection\n2. Investigation\n3. Mitigation\n4. Recovery',
        style: noteStyle,
      },
      {
        slug: 'impact',
        type: 'note',
        x: 840,
        y: 176,
        w: 360,
        h: 214,
        text: 'Customer Impact\n\n- Symptoms observed\n- Revenue or trust impact\n- Communication sent',
        style: noteStyle,
      },
      {
        slug: 'response',
        type: 'rect',
        x: 120,
        y: 430,
        w: 320,
        h: 250,
        text: 'Detection / Response\n\n- How the issue was discovered\n- What signals were useful\n- What was missing',
        style: accentStyle,
      },
      {
        slug: 'root-cause',
        type: 'rect',
        x: 480,
        y: 430,
        w: 320,
        h: 250,
        text: 'Root Cause\n\n- Trigger\n- Why safeguards failed\n- Why it escaped earlier review',
        style: panelStyle,
      },
      {
        slug: 'follow-up',
        type: 'note',
        x: 840,
        y: 430,
        w: 360,
        h: 250,
        text: 'Follow-up Actions\n\n- [ ] Alerting or dashboard gap\n- [ ] Code or config fix\n- [ ] Runbook / training update',
        style: noteStyle,
      },
    ]),
}

const lessonPlanTemplate: NotebookTemplate = {
  id: 'lesson-plan',
  name: 'Lesson Plan',
  description: 'A teaching board for preparing objectives, class flow, activities, and assessment points.',
  highlights: ['Objectives and materials', 'Lesson sequence', 'Assessment and homework'],
  buildItems: () =>
    buildTemplate('lesson', [
      {
        slug: 'title',
        type: 'text',
        x: 120,
        y: 72,
        w: 640,
        h: 72,
        text: 'Lesson Plan',
        style: titleStyle,
      },
      {
        slug: 'overview',
        type: 'rect',
        x: 840,
        y: 78,
        w: 360,
        h: 104,
        text: 'Topic:\nAudience:\nDuration:\nClass goal:',
        style: accentStyle,
      },
      {
        slug: 'objectives',
        type: 'note',
        x: 120,
        y: 190,
        w: 320,
        h: 250,
        text: 'Learning Objectives\n\n- Learners will be able to...\n- Learners will practice...\n- Learners will reflect on...',
        style: noteStyle,
      },
      {
        slug: 'sequence',
        type: 'rect',
        x: 470,
        y: 190,
        w: 390,
        h: 250,
        text: 'Lesson Sequence\n\n1. Warm-up\n2. Explain concept\n3. Guided practice\n4. Independent work\n5. Wrap-up',
        style: panelStyle,
      },
      {
        slug: 'materials',
        type: 'note',
        x: 890,
        y: 190,
        w: 310,
        h: 250,
        text: 'Materials\n\n- Slides / board setup\n- Handout or worksheet\n- Example problems',
        style: noteStyle,
      },
      {
        slug: 'activities',
        type: 'rect',
        x: 120,
        y: 480,
        w: 420,
        h: 246,
        text: 'Activities\n\n- Pair discussion prompt\n- Short exercise\n- Small group share-out',
        style: successStyle,
      },
      {
        slug: 'assessment',
        type: 'rect',
        x: 575,
        y: 480,
        w: 300,
        h: 246,
        text: 'Assessment\n\n- Exit ticket question\n- Observation checklist\n- What success looks like',
        style: panelStyle,
      },
      {
        slug: 'homework',
        type: 'note',
        x: 910,
        y: 480,
        w: 290,
        h: 246,
        text: 'Homework / Follow-up\n\n- Practice task\n- Reflection prompt\n- Next lesson bridge',
        style: noteStyle,
      },
    ]),
}

const studySessionTemplate: NotebookTemplate = {
  id: 'study-session',
  name: 'Study Session',
  description: 'A focused note layout for self-study, tutoring, and revision sessions.',
  highlights: ['Concept map and examples', 'Questions and memory hooks', 'Practice checklist'],
  buildItems: () =>
    buildTemplate('study', [
      {
        slug: 'title',
        type: 'text',
        x: 120,
        y: 72,
        w: 720,
        h: 72,
        text: 'Study Session',
        style: titleStyle,
      },
      {
        slug: 'concepts',
        type: 'rect',
        x: 120,
        y: 180,
        w: 380,
        h: 244,
        text: 'Key Concepts\n\n- Definition\n- Rule or formula\n- Common pitfall',
        style: panelStyle,
      },
      {
        slug: 'examples',
        type: 'note',
        x: 530,
        y: 180,
        w: 330,
        h: 244,
        text: 'Worked Examples\n\n1. Example problem\n2. Step-by-step solution\n3. Why the method works',
        style: noteStyle,
      },
      {
        slug: 'questions',
        type: 'note',
        x: 890,
        y: 180,
        w: 310,
        h: 244,
        text: 'Questions to Ask\n\n- What is still fuzzy?\n- Where do I hesitate?\n- What should I explain out loud?',
        style: noteStyle,
      },
      {
        slug: 'memory',
        type: 'rect',
        x: 120,
        y: 460,
        w: 380,
        h: 256,
        text: 'Memory Hooks\n\n- Analogy\n- Mnemonic\n- Quick summary in my own words',
        style: accentStyle,
      },
      {
        slug: 'review',
        type: 'rect',
        x: 530,
        y: 460,
        w: 300,
        h: 256,
        text: 'Review Plan\n\nToday:\n- Core topic\n\nTomorrow:\n- Retrieval practice\n\nThis week:\n- Mixed problems',
        style: successStyle,
      },
      {
        slug: 'checklist',
        type: 'note',
        x: 860,
        y: 460,
        w: 340,
        h: 256,
        text: 'Practice Checklist\n\n- [ ] Summarize from memory\n- [ ] Solve one fresh problem\n- [ ] Review mistakes and retry',
        style: noteStyle,
      },
    ]),
}

export const NOTE_TEMPLATE_SECTIONS: NotebookTemplateSection[] = [
  {
    id: 'business',
    label: 'Business',
    templates: [meetingNotesTemplate, projectBriefTemplate],
  },
  {
    id: 'engineering',
    label: 'Engineering',
    templates: [architectureReviewTemplate, incidentReviewTemplate],
  },
  {
    id: 'education',
    label: 'Education',
    templates: [lessonPlanTemplate, studySessionTemplate],
  },
]
