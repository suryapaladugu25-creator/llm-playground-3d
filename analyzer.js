/**
 * analyzer.js - Live Prompt Analysis Engine
 * 
 * Detects prompting techniques in real-time as the user types:
 * - Shot count (Zero-shot, One-shot, Few-shot) ignoring final empty Output
 * - Chain-of-Thought (CoT)
 * - Role Prompting
 * - Negative Constraints
 * - Format Constraints
 * 
 * Provides matched evidence and tailored, beginner-friendly tips.
 */

export function analyzePrompt(text = '') {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      isEmpty: true,
      shotType: 'ZERO-SHOT',
      shotCount: 0,
      badgeText: 'ZERO-SHOT (0)',
      badgeClass: 'badge-zero',
      chainOfThought: { detected: false, evidence: null },
      rolePrompting: { detected: false, evidence: null },
      negativeConstraints: { detected: false, evidence: null },
      formatConstraints: { detected: false, evidence: null },
      examplesEvidence: [],
      tip: 'Start typing a prompt or choose an example chip below to see live analysis!'
    };
  }

  // 1. Detect Examples & Shot Type
  const { count: shotCount, evidence: examplesEvidence } = countExamples(trimmed);
  let shotType = 'ZERO-SHOT';
  let badgeClass = 'badge-zero';

  if (shotCount === 1) {
    shotType = 'ONE-SHOT';
    badgeClass = 'badge-one';
  } else if (shotCount >= 2) {
    shotType = 'FEW-SHOT';
    badgeClass = 'badge-few';
  }
  const badgeText = `${shotType} (${shotCount})`;

  // 2. Chain-of-Thought (CoT) Detection
  const cotRegex = /\b(think\s*(?:step\s*by\s*step|carefully|deeply)|step[- ]by[- ]step|let'?s\s*think|work\s*(?:through|out)\s*(?:this|the\s*problem|step)|explain\s*(?:your|the)\s*reasoning|show\s*(?:your|all)\s*work|chain\s*of\s*thought|break\s*(?:this|it)\s*down|reasoning\s*steps?|first\s*,\s*then\s*,\s*finally)\b/i;
  const cotMatch = trimmed.match(cotRegex);
  const chainOfThought = {
    detected: Boolean(cotMatch),
    evidence: cotMatch ? `"${cotMatch[0]}"` : null
  };

  // 3. Role Prompting Detection
  const roleRegex = /\b(you\s+are\s+(?:a|an)\s+[a-z0-9_-]+|act\s+as\s+(?:a|an)\s+[a-z0-9_-]+|as\s+an?\s+(?:expert|assistant|developer|coder|programmer|tutor|teacher|mentor|pirate|historian|doctor|engineer|scientist|analyst|counselor|copywriter|writer)|take\s+on\s+the\s+role\s+of|your\s+role\s+is|pretend\s+(?:you\s+are|to\s+be)|imagine\s+you\s+are)\b/i;
  const roleMatch = trimmed.match(roleRegex);
  const rolePrompting = {
    detected: Boolean(roleMatch),
    evidence: roleMatch ? `"${roleMatch[0]}"` : null
  };

  // 4. Negative Constraints Detection
  const negRegex = /\b(do\s*not|don'?t|never|avoid|without\s+(?:using|mentioning|including|revealing|any)|must\s*not|refrain\s+from|exclude|no\s+(?:preamble|intro|fluff|chit-?chat|markdown|explanation|greeting)|omit)\b/i;
  const negMatch = trimmed.match(negRegex);
  const negativeConstraints = {
    detected: Boolean(negMatch),
    evidence: negMatch ? `"${negMatch[0]}"` : null
  };

  // 5. Format Constraints Detection
  const formatRegex = /\b(in\s+json\b|json\s+(?:format|object|array|schema)|respond\s+(?:in|with)\s+(?:json|yaml|xml|csv|markdown|html|table)\b|markdown\s+table|bullet\s+points?|numbered\s+list|in\s+\d+\s+(?:sentences?|words?|paragraphs?|bullet\s*points?)|strictly\s+(?:format|output)|only\s+(?:output|return|respond\s+with)|schema\s*:|csv\s+format)\b/i;
  const formatMatch = trimmed.match(formatRegex);
  const formatConstraints = {
    detected: Boolean(formatMatch),
    evidence: formatMatch ? `"${formatMatch[0]}"` : null
  };

  // 6. Generate beginner-friendly, dynamic tip
  const tip = generatePromptTip({
    shotCount,
    shotType,
    chainOfThought: chainOfThought.detected,
    rolePrompting: rolePrompting.detected,
    negativeConstraints: negativeConstraints.detected,
    formatConstraints: formatConstraints.detected,
    promptLength: trimmed.length
  });

  return {
    isEmpty: false,
    shotType,
    shotCount,
    badgeText,
    badgeClass,
    chainOfThought,
    rolePrompting,
    negativeConstraints,
    formatConstraints,
    examplesEvidence,
    tip
  };
}

/**
 * Counts few-shot examples in the prompt while ignoring trailing empty Output: query
 */
function countExamples(text) {
  const evidence = [];

  // Pattern A: Input/Output, Question/Answer, Review/Sentiment, or common pair tags
  const qaPattern = /(?:(?:input|question|query|prompt|q|review|text|sentence|tweet|premise|example|context|user|source)\s*:\s*([^\n\r]+)[\r\n\s]+(?:output|answer|response|a|sentiment|label|class|category|classification|translation|hypothesis|assistant|target)\s*:\s*([^\n\r]*))/gi;
  let match;
  const qaMatches = [];
  while ((match = qaPattern.exec(text)) !== null) {
    const questionText = match[1].trim();
    const answerText = match[2].trim();
    qaMatches.push({
      full: match[0].trim(),
      index: match.index,
      length: match[0].length,
      question: questionText,
      answer: answerText,
      isEmptyAnswer: !answerText
    });
  }

  // If the very last QA match has an empty answer, it's the target prompt!
  // Filter out the last one if empty
  if (qaMatches.length > 0) {
    const lastQA = qaMatches[qaMatches.length - 1];
    const isAtEnd = (lastQA.index + lastQA.length) >= (text.length - 15);
    const validQAs = qaMatches.filter((item, idx) => {
      if (idx === qaMatches.length - 1 && item.isEmptyAnswer && isAtEnd) {
        return false; // Target question, not an example
      }
      return item.answer.length > 0;
    });

    if (validQAs.length > 0) {
      validQAs.forEach(m => evidence.push(truncateEvidence(`${m.question} ➔ ${m.answer}`)));
      return { count: validQAs.length, evidence };
    }
  }

  // Pattern A2: Generic repeating key-value tag pairs (e.g. Tag1: ... \n Tag2: ...)
  const genericTagRegex = /^([A-Za-z0-9_-]{1,16}):\s*([^\n\r]*)$/gm;
  const genericLines = [];
  let gMatch;
  while ((gMatch = genericTagRegex.exec(text)) !== null) {
    genericLines.push({
      tag: gMatch[1].toLowerCase(),
      val: gMatch[2].trim(),
      full: gMatch[0]
    });
  }
  // Check if lines alternate [TagA, TagB, TagA, TagB...]
  if (genericLines.length >= 2) {
    const tagA = genericLines[0].tag;
    const tagB = genericLines[1].tag;
    if (tagA !== tagB) {
      const validGenericPairs = [];
      for (let i = 0; i < genericLines.length - 1; i += 2) {
        if (genericLines[i].tag === tagA && genericLines[i + 1].tag === tagB) {
          const isLast = (i + 2 >= genericLines.length);
          const valB = genericLines[i + 1].val;
          if (isLast && !valB) {
            // Target question
            continue;
          }
          if (valB) {
            validGenericPairs.push(`${genericLines[i].val} ➔ ${valB}`);
          }
        }
      }
      if (validGenericPairs.length > 0) {
        validGenericPairs.forEach(p => evidence.push(truncateEvidence(p)));
        return { count: validGenericPairs.length, evidence };
      }
    }
  }

  // Pattern B: Arrow lines (e.g. "happy -> positive", "terrible => negative")
  const arrowLines = text.split('\n')
    .map(line => line.trim())
    .filter(line => /^[^\n\r]+?\s*(?:->|=>|➔|➜)\s*[^\n\r]+$/.test(line));

  if (arrowLines.length > 0) {
    // Check if the last line ends right after the arrow without target answer
    const validArrowLines = arrowLines.filter(line => {
      const parts = line.split(/(?:->|=>|➔|➜)/);
      return parts[1] && parts[1].trim().length > 0;
    });
    if (validArrowLines.length > 0) {
      validArrowLines.forEach(l => evidence.push(truncateEvidence(l)));
      return { count: validArrowLines.length, evidence };
    }
  }

  // Pattern C: Markdown blocks or numbered examples (### Example 1 / ---)
  const blockMatches = text.match(/(?:###\s*Example|\bExample\s*\d+\s*:|---[\s\S]+?---)/gi);
  if (blockMatches && blockMatches.length > 0) {
    blockMatches.forEach(b => evidence.push(truncateEvidence(b)));
    return { count: blockMatches.length, evidence };
  }

  // Pattern D: Quoted pairs like "hello" : "greeting" or "cat" = "animal"
  const quotedPairs = text.match(/"[^"\n\r]+"[\s]*[:=][\s]*"[^"\n\r]+"/g);
  if (quotedPairs && quotedPairs.length > 0) {
    quotedPairs.forEach(p => evidence.push(truncateEvidence(p)));
    return { count: quotedPairs.length, evidence };
  }

  return { count: 0, evidence: [] };
}

function truncateEvidence(str, max = 40) {
  if (str.length <= max) return str;
  return str.substring(0, max - 3) + '...';
}

function generatePromptTip({
  shotCount,
  shotType,
  chainOfThought,
  rolePrompting,
  negativeConstraints,
  formatConstraints,
  promptLength
}) {
  if (shotCount === 0 && promptLength > 40 && !chainOfThought && !formatConstraints) {
    return '💡 Tip: Add 1–2 input/output examples (few-shot) or a format constraint like "in JSON" for higher precision.';
  }

  if (shotCount === 1) {
    return '💡 Tip: One-shot detected! Adding a 2nd varied example helps the LLM distinguish pattern from content.';
  }

  if (shotCount >= 2) {
    if (!formatConstraints) {
      return '⭐ Pro-tip: Great few-shot structure! Make sure your prompt ends with the matching "Output:" tag for smooth completion.';
    }
    return '⭐ Pro-tip: Outstanding few-shot prompt with strict formatting! This maximizes accuracy on Groq models.';
  }

  if (chainOfThought) {
    return '🧠 Tip: Chain-of-thought active! This helps the LLM break complex problems down step-by-step.';
  }

  if (rolePrompting && !formatConstraints) {
    return '🎭 Tip: Great role assignment! Anchor it further by specifying output style (e.g., bullet points or concise).';
  }

  if (negativeConstraints && !formatConstraints) {
    return '⚠️ Tip: When telling the model what NOT to do, also specify what TO do instead for best adherence.';
  }

  if (formatConstraints) {
    return '📐 Tip: Format constraint active! The model will enforce your requested layout.';
  }

  return '💡 Tip: Try giving the model a specific persona ("Act as...") or structured examples for best results!';
}

