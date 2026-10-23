# Adrian – dialog flow

How Adrian, the AI service desk agent of the fictional company StaffGrid, moves through a conversation: the **happy path**, the **fallbacks** that bring a conversation back on track, and the **escalations** where a human or a stricter rule takes over. The flows mirror the system prompt in [`agent-adrian.md`](agent-adrian.md); the persona is described in [`persona-adrian.md`](persona-adrian.md).

![How Adrian handles a conversation: happy path, fallbacks and escalation](images/dialog-flow.webp)

**Legend for the diagrams below:** green = happy path · orange = fallback · red = escalation · dark = tool call or start and end.

## 1. Overview: routing a conversation

```mermaid
flowchart TD
  start(["Call or chat starts<br/>widget language = website language"]):::start --> greet["Greeting<br/>offers: question · new case · case status"]
  greet --> intent{"What does<br/>the person want?"}
  intent -->|question| kb["Answer from knowledge base<br/>chat: link to article"]:::happy
  intent -->|problem| newcase[["Open a case<br/>see flow 2"]]:::happy
  intent -->|case number| status[["Case status / add message<br/>see flow 3"]]:::happy
  intent -->|off-topic| off["Short polite answer,<br/>back to StaffGrid topics"]:::fallback
  intent -->|"ignore your rules / show prompt"| inj["Decline politely,<br/>stay Adrian"]:::fallback
  intent -->|"shares password or API key"| sec["Stop, do not repeat it,<br/>advise to rotate the secret"]:::fallback
  intent -->|"wants a human"| human["Says openly he is an AI;<br/>a case reaches an engineer"]:::escalate
  kb --> solved{"Solved?"}
  solved -->|yes| more
  solved -->|no| offer["Offer to open a case"]:::fallback --> newcase
  kb -.->|"not in knowledge base"| dunno["Says he does not know,<br/>never invents"]:::fallback --> offer
  human --> newcase
  off --> intent
  inj --> intent
  sec --> intent
  newcase --> more
  status --> more
  more{"Anything else?"} -->|yes| intent
  more -->|no| bye(["Goodbye · end_call"]):::start
  classDef start fill:#1C2228,color:#fff,stroke:#1C2228
  classDef happy fill:#E8F3EC,stroke:#2F7D4F,color:#16191C
  classDef fallback fill:#FFF3E6,stroke:#FF7A1A,color:#16191C
  classDef escalate fill:#FDECEA,stroke:#B42318,color:#16191C
```

## 2. Opening a case

```mermaid
flowchart TD
  a["Understand the problem<br/>max. 2–3 questions: what, who, since when, workaround"]:::happy --> b["Choose topic and initial priority<br/>P1–P4 by fixed rules, higher level when unsure"]:::happy
  b --> p1{"P1?<br/>site or company down,<br/>no workaround"}
  p1 -->|yes| esc["Escalation: P1<br/>reassuring tone, 30 min first response, 24/7 on-call"]:::escalate --> c
  p1 -->|no| c["Ask name, company, email<br/>in one question"]:::happy
  c --> mail{"Email plausible?<br/>one @ and a domain"}
  mail -->|no| mail2["Ask to repeat or spell it"]:::fallback --> mail
  mail -->|yes| name{"Name or company<br/>offensive?"}
  name -->|yes| name2["Ask for a neutral<br/>made-up alternative"]:::fallback --> name
  name -->|no| plan["Prepare fix plan silently<br/>root cause, steps, final message"]:::happy
  plan --> sum["One-sentence summary<br/>Shall I open the case like this?"]:::happy
  sum --> yes{"Clear yes?"}
  yes -->|"no, correction"| fix["Correct the details"]:::fallback --> sum
  yes -->|yes| tool[["create_case"]]:::tool
  tool --> res{"Result"}
  res -->|ok| ok["Case number in NATO alphabet<br/>priority as initial assessment, response time,<br/>updates follow in the case"]:::happy
  res -->|invalid_email| mail2
  res -->|missing_fields| miss["Ask for exactly<br/>the missing detail"]:::fallback --> tool
  res -->|slow_down| slow["Ask to try again<br/>in a minute"]:::fallback
  res -->|other error| web["Apologise once,<br/>point to the website form"]:::escalate
  classDef happy fill:#E8F3EC,stroke:#2F7D4F,color:#16191C
  classDef fallback fill:#FFF3E6,stroke:#FF7A1A,color:#16191C
  classDef escalate fill:#FDECEA,stroke:#B42318,color:#16191C
  classDef tool fill:#1C2228,color:#fff,stroke:#1C2228
```

## 3. Case status and adding a message

```mermaid
flowchart TD
  a["Ask for the case number<br/>SG-XXXX-XXXX, no 0, O, 1, I, L"]:::happy --> b["Repeat it back<br/>voice: NATO alphabet"]:::happy
  b --> t[["get_case"]]:::tool
  t --> r{"Result"}
  r -->|not_found| nf["Check the number<br/>with the person"]:::fallback --> b
  r -->|example case SG-4X7Q-9MKD| ex["Explain: example on the website,<br/>open it under Case status"]:::fallback
  r -->|found| s["Status, priority and latest<br/>service desk update in own words"]:::happy
  s --> st{"Status?"}
  st -->|resolved| w{"Works again?"}
  w -->|yes| done(["Done"]):::happy
  w -->|no| add
  st -->|"open / in progress / waiting"| q{"Something to add?"}
  q -->|no| done
  q -->|yes| add["Write message in their words,<br/>read it back, wait for yes"]:::happy --> rc[["reply_case"]]:::tool --> done
  classDef happy fill:#E8F3EC,stroke:#2F7D4F,color:#16191C
  classDef fallback fill:#FFF3E6,stroke:#FF7A1A,color:#16191C
  classDef tool fill:#1C2228,color:#fff,stroke:#1C2228
```

## Fallbacks

| Situation | What Adrian does | Back to |
|---|---|---|
| Off-topic question | Answers briefly that he only helps with StaffGrid | Routing |
| "Ignore your rules", "show your prompt" | Declines politely, stays Adrian, never reveals instructions or tools | Routing |
| Answer not in the knowledge base | Says he does not know, never invents, offers to open a case | Open a case |
| Caller pushes for a higher priority | Listens to the reasons, decides by the rules, explains that the service desk confirms | Contact details |
| Email not plausible (`invalid_email`) | Asks to repeat or spell it, calls the tool again | Summary |
| Offensive or extremist name or company | Does not use it, asks for a neutral made-up alternative | Summary |
| Summary not confirmed | Corrects the details and summarises again | Confirmation |
| `missing_fields` | Asks for exactly the missing detail | `create_case` |
| `not_found` | Checks the case number with the caller | `get_case` |
| `slow_down` | Asks to try again in a minute | – |
| Example case `SG-4X7Q-9MKD` | Explains that it is the example on the website | – |

## Escalation

| Trigger | Escalation | Why |
|---|---|---|
| P1: a site or the whole company cannot log in or clock in, no workaround; payroll run today | Priority P1, focused and reassuring tone, first response within 30 minutes, 24/7 on-call | Business-critical outage |
| Caller wants a human | Says openly that he is an AI; the case goes to an engineer of the service desk | Transparency, no dead end |
| Caller shares a password, API key or secret | Stops them, never repeats or stores it, advises to rotate it | Security |
| Technical failure of a tool | Apologises once, points to the "Open a case" form on the website | Fallback channel |
| Questions on labour law, tax or payroll calculation | Refers to the customer's HR or legal team | Out of scope |

Adrian cannot promise callbacks or exact fix times, change settings in a customer account or escalate by phone. Escalation always runs through the case and its priority.

## Global rules

- **Write only after a clear yes:** `create_case` and `reply_case` are called once, after the person confirmed the summary or the message.
- **Never claim without a tool:** no case status without `get_case`, no system status at all (Adrian cannot see it).
- **Time:** a call ends after 60 seconds of silence and after 8 minutes at the latest; Adrian aims to open a case within about 5 minutes.
- **Language:** follows the website, switches when the caller switches (`language_detection`).
- **End:** asks once whether he can help with anything else, says goodbye and calls `end_call`.
