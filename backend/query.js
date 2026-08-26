const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany({
    where: { nome: { contains: 'Nascimento' } }
  });
  console.log(clients);
}

main().finally(() => prisma.$disconnect());
