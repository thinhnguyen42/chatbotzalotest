FROM node:24-alpine AS base                                     
RUN corepack enable && corepack prepare pnpm@11.0.8 --activate  
                                                                
WORKDIR /app                                                    
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./         
RUN pnpm install --frozen-lockfile                              
                                                                
COPY . .                                                        
RUN pnpm run build                                              
                                                                
EXPOSE 3000                                                     
CMD ["pnpm", "run", "start"]