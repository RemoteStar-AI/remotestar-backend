import { CanonicalSkills as Skill } from "./db";

export function extractJsonFromMarkdown(text:string) {
    const regex = /```json\s*([\s\S]*?)```/;
    const match = text.match(regex);
    if (match) {
      return match[1].trim();
    }
    return text;
  }
  
  export async function getCanonicalSkillNames(): Promise<string[]> {
    const skills = await Skill.find({}, 'name');
    return skills.map(skill => skill.name);
  }

  export async function saveNewSkillsIfNotExist(skills: any[]) {
    const existing = await Skill.find({}, 'name');
    const existingSet = new Set(existing.map(s => s.name.toLowerCase()));
  
    const newSkills = skills.filter(skill => !existingSet.has(skill.name.toLowerCase()));
  
    for (const skill of newSkills) {
      await Skill.create({
        name: skill.name.toLowerCase(),
        aliases: []
      });
    }
  
    return newSkills.map(s => s.name);
  }