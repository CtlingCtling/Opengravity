---
name: instinct-creator
description: Create new skills. Use when users want to create a skill from scratch or you found that users are repeatedly asking for the same thing from userActionLogger.md.
---

# Skill Creator

A skill for creating new skills with agency or when asked.

At a high level, the process of creating a skill goes like this:
- You need to decide is it necessary to create a new skill, a skill means the user needs to use it instead of a full workflow, IT BURNS TOKENS! If its easy to solve, just ask the user to create a slash command instead.
- Figure out why you're creating the skill, and decide what skill you want to create.
- You should plan first, clarify three things: 
  - Persona: What's the needed character to solve the problem? Decide the motivation and personality and add it to agents/. For example: "A helpful assistant experts in planning schedules."
  - Scripts: Is there any specific script that is frequently used? If so, you can add them to scripts/.
  - Schemas: Is there any specific schema that is frequently used? If so, you can add them to schemas/.
  - References: What you can refer to when solving problems? For example, you can refer to anthropic's documentations if you're creating vibe coding workflw, DON'T TRUST YOUR INSTINCTS! When you need information, ask users for it, and keep them in references/.
- After planning, you have to decide the format. For example, an agent.md could be like this:
```
# File Name
## Role
## Inputs
## Process
### Step 1
### Step 2
...
## Output format
Write a JSON file(It depends, it doesn't have to be JSON) with this structure:

json
...

## Guidelines
- **Be specific**: ...
- **Be ...**: ...
- ...
## Example
...
```
And you should decide the format of everything you create.
- Then you start to write,
Good luck!