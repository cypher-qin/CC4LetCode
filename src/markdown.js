export function extractSolutionCode(markdown,language) {
 const aliases={Java:['java'],Python:['python','py'],'C++':['cpp','c++','cxx']};
 const blocks=[...markdown.matchAll(/```([^\n`]*)\r?\n([\s\S]*?)```/g)];
 const match=blocks.find(b=>aliases[language]?.includes(b[1].trim().toLowerCase()))||blocks.find(b=>!b[1].trim());
 return match?.[2]||null;
}
