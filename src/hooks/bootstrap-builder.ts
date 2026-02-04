import type { PersonaConfig, EngagementRule, BudgetConfig } from '../types/config.js';

interface BuildContext {
  agentName: string;
  persona: PersonaConfig;
  rules: EngagementRule[];
  budgets: BudgetConfig;
  actionsToday: { posts: number; comments: number; votes: number; browses: number };
  recentPosts?: string[];
  recentPostIds?: string[];
}

export function buildBootstrapContent(
  actionType: 'post' | 'browse' | 'engage',
  ctx: BuildContext
): string {
  const personaSection = buildPersonaSection(ctx.persona, ctx.agentName);

  if (actionType === 'post') {
    return buildPostContent(ctx, personaSection);
  }

  return buildBrowseContent(ctx, personaSection);
}

function buildPersonaSection(persona: PersonaConfig, agentName: string): string {
  return `## Your Persona
You are **${agentName}**.

**Voice:**
- Formality: ${persona.voice.formality}/100 (${persona.voice.formality > 50 ? 'more professional' : 'more casual'})
- Humor: ${persona.voice.humor}/100 (${persona.voice.humor > 50 ? 'more playful' : 'more serious'})
- Verbosity: ${persona.voice.verbosity}/100 (${persona.voice.verbosity > 50 ? 'more elaborate' : 'more terse'})
- Confidence: ${persona.voice.confidence}/100 (${persona.voice.confidence > 50 ? 'more assertive' : 'more tentative'})

**Social Style:**
- Warmth: ${persona.social.warmth}/100
- Agreeableness: ${persona.social.agreeableness}/100
- Initiative: ${persona.social.initiative}/100

**Content:**
- Topics of interest: ${persona.content.topicsOfInterest.join(', ') || 'none specified'}
- Topics to avoid: ${persona.content.topicsToAvoid.join(', ') || 'none specified'}
- Opinion strength: ${persona.content.opinionStrength}/100

**Identity:**
- Bio: ${persona.identity.bio || 'Not specified'}
- Core beliefs: ${persona.identity.coreBeliefs.join('; ') || 'none specified'}`;
}

function buildPostContent(ctx: BuildContext, personaSection: string): string {
  const remaining = ctx.budgets.postsPerDay - ctx.actionsToday.posts;

  return `# Moltbook Posting Task

${personaSection}

## Instructions
1. Generate an original post that reflects your persona
2. Consider trending topics but stay authentic to your interests
3. Keep your voice consistent with the settings above
4. Use the \`moltbook_post\` tool to publish

## Budget Status
- Posts today: ${remaining}/${ctx.budgets.postsPerDay} remaining

## Recent Posts (avoid repetition)
${ctx.recentPosts?.map(p => `- ${p}`).join('\n') || 'No recent posts'}`;
}

function buildBrowseContent(ctx: BuildContext, personaSection: string): string {
  const commentsRemaining = ctx.budgets.commentsPerDay - ctx.actionsToday.comments;
  const votesRemaining = ctx.budgets.votesPerDay - ctx.actionsToday.votes;

  const rulesSection = ctx.rules
    .filter(r => r.enabled)
    .map(r => formatRule(r))
    .join('\n');

  return `# Moltbook Browsing Task

${personaSection}

## Engagement Rules
${rulesSection || 'No rules configured - use your judgment'}

## Instructions
1. Use \`moltbook_browse\` to fetch feed posts
2. Evaluate each post against engagement rules and your persona
3. For posts you engage with:
   - Use \`moltbook_comment\` with persona-appropriate response
   - Or use \`moltbook_vote\` if just showing appreciation
4. Use \`moltbook_memory_query\` to check past interactions

## Budget Status
- Comments today: ${commentsRemaining}/${ctx.budgets.commentsPerDay} remaining
- Votes today: ${votesRemaining}/${ctx.budgets.votesPerDay} remaining

## Recent Interactions (skip these)
${ctx.recentPostIds?.map(id => `- ${id}`).join('\n') || 'None'}`;
}

function formatRule(rule: EngagementRule): string {
  const trigger = formatTrigger(rule.trigger);
  return `- If ${trigger}: ${rule.probability}% chance to ${rule.action}`;
}

function formatTrigger(trigger: EngagementRule['trigger']): string {
  switch (trigger.type) {
    case 'mention':
      return 'a post mentions you';
    case 'upvotes':
      return `a post has ${trigger.value}+ upvotes`;
    case 'followed':
      return 'a post is from someone you follow';
    case 'keyword':
      return `a post contains "${trigger.value}"`;
    case 'submolt':
      return `a post is in ${trigger.value}`;
    default:
      return trigger.type;
  }
}
