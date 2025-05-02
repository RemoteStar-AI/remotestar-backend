import { CanonicalSkills as Skill } from "./db";

export function extractJsonFromMarkdown(text:string) {
    const regex = /```json\s*([\s\S]*?)```/;
    const match = text.match(regex);
    if (match) {
      return match[1].trim();
    }
    return text;
  }
  
  // export async function getCanonicalSkillNames(): Promise<string[]> {
  //   const skills = await Skill.find({}, 'name');
  //   console.log("skills\n", skills.map(skill => skill.name));
  //   return skills.map(skill => skill.name);
  // }

  // export async function saveNewSkillsIfNotExist(skills: any[]) {
  //   console.log("Starting saveNewSkillsIfNotExist with skills:", skills);
    
  //   const existing = await Skill.find({}, 'name');
  //   console.log("Found existing skills:", existing);
    
  //   const existingSet = new Set(existing.map(s => s.name.toLowerCase()));
  //   console.log("Created set of existing skill names:", Array.from(existingSet));
  
  //   const newSkills = skills.filter(skill => !existingSet.has(skill.name.toLowerCase()));
  //   console.log("Filtered new skills to add:", newSkills);
  
  //   for (const skill of newSkills) {
  //     console.log("Creating new skill:", skill.name);
  //     await Skill.create({
  //       name: skill.name.toLowerCase(),
  //       aliases: []
  //     });
  //   }
  
  //   const result = newSkills.map(s => s.name);
  //   console.log("Returning newly added skill names:", result);
  //   return result;
  // }