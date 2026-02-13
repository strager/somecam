# Explore Flow — User Story

## Entering the explore page

After choosing their sources of meaning on the cards page, the user lands on the
"Your Sources of Meaning" overview. Each card has an **Explore** button. Clicking
it takes the user to `/explore/:cardId`, where they begin a guided reflection on
that card.

## Answering the first question

The explore page shows the card's description at the top, followed by a single
question drawn from one of five exploration topics: Interpretation, Significance,
Importance, Threat, and Change. The question is randomly assigned when the user
first visits the chosen-cards page.

A textarea is displayed below the question. The user types their reflection and
clicks **Next** (or presses Shift+Enter) to submit their answer.

## LLM inference after each answer

Once the user submits an answer, the app sends all answers given so far to the
backend. The LLM reads the card context and every answered question, then checks
whether the user's responses already address any of the remaining unanswered
questions. If so, it drafts short answers in the user's own style.

## Pre-filled questions appearing next

If the LLM determined that a remaining question was already addressed, that
question is shown next with the LLM's suggested answer pre-filled in the
textarea. The user can review the pre-fill, edit it, or replace it entirely
before submitting. If no question was pre-filled, the next question is chosen at
random from the remaining pool.

## Editing or accepting pre-fills

When a pre-filled answer appears, the user is free to accept it as-is by
clicking **Next**, or they can modify the text to better capture their thoughts.
The textarea behaves exactly the same whether the answer was pre-filled or blank.

## Answering all five questions and auto-navigation

The user works through questions one at a time. Previously answered questions are
displayed as read-only text above the active question, so the user can see the
full history of their reflections. After the fifth and final answer is submitted,
the app automatically navigates to `/chosen`, returning the user to the
sources-of-meaning overview.

## Answer depth check

After the user submits an answer, the app fires two requests in parallel: the
existing infer-answers call and a new **check-answer-depth** call. The depth
check asks an LLM whether the answer shows genuine reflection (specific personal
details, self-awareness, explores "why"). If the answer looks too brief or
generic, a follow-up question is displayed inline — styled in amber to
distinguish it from the regular green questions — nudging the user toward deeper
reflection.

The user can edit their answer in response to the follow-up, or simply press
**Next** again to skip the guardrail and continue to the next question. The
guardrail never blocks progress.

If the depth-check request fails (network error, API error, unparseable
response), the app fails open: it treats the answer as sufficient and advances
normally. This ensures the depth check is purely additive and never degrades the
core explore experience.

## Using "Stop Exploring" for early exit

At any point during the exploration, a **Stop Exploring** button is visible below
the active question. Clicking it saves whatever text is currently in the textarea
(if any) and immediately navigates to `/chosen`. The user does not need to answer
all five questions — they can stop whenever they feel they have reflected enough.
