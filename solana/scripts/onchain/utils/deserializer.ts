import { getProgramDerivedAddress, type Address } from "@solana/kit";
import { BufferReader } from "./buffer-reader";

type Message = Call | Transfer;

type Call = {
  type: "Call";
  ixs: Awaited<ReturnType<typeof deserializeIx>>[];
};

type Transfer = {
  type: "Transfer";
  transfer:
    | {
        type: "Sol";
        remoteToken: Buffer;
        to: Address;
        amount: bigint;
      }
    | {
        type: "Spl";
        remoteToken: Buffer;
        localToken: Address;
        to: Address;
        amount: bigint;
      }
    | {
        type: "WrappedToken";
        localToken: Address;
        to: Address;
        amount: bigint;
      };

  ixs: Awaited<ReturnType<typeof deserializeIx>>[];
};

export async function deserializeMessage(buffer: Buffer): Promise<Message> {
  const reader = new BufferReader(buffer);

  // Read Message enum discriminator (1 byte)
  const messageDiscriminator = reader.readUInt8();

  // Message::Call(Vec<Ix>)
  if (messageDiscriminator === 0) {
    const ixs = await deserializeIxs(reader);
    return { type: "Call", ixs };
  }
  // Message::Transfer { transfer: Transfer, ixs: Vec<Ix> }
  else if (messageDiscriminator === 1) {
    // Read Transfer enum discriminator (1 byte)
    const transferDiscriminator = reader.readUInt8();

    let transfer: Transfer["transfer"];
    // Sol(FinalizeBridgeSol)
    if (transferDiscriminator === 0) {
      const remoteToken = reader.readArray20(); // [u8; 20]
      const to = reader.readAddress(); // Address
      const amount = reader.readBigUInt64LE(); // u64

      transfer = { type: "Sol", remoteToken, to, amount };
    }
    // Spl(FinalizeBridgeSpl)
    else if (transferDiscriminator === 1) {
      const remoteToken = reader.readArray20(); // [u8; 20]
      const localToken = reader.readAddress(); // Address (mint)
      const to = reader.readAddress(); // Address
      const amount = reader.readBigUInt64LE(); // u64

      transfer = { type: "Spl", remoteToken, localToken, to, amount };
    }
    // WrappedToken(FinalizeBridgeWrappedToken)
    else if (transferDiscriminator === 2) {
      const localToken = reader.readAddress(); // Address (mint)
      const to = reader.readAddress(); // Address
      const amount = reader.readBigUInt64LE(); // u64

      transfer = { type: "WrappedToken", localToken, to, amount };
    }
    // Unknown transfer discriminator
    else {
      throw new Error(
        `Unknown transfer discriminator: ${transferDiscriminator}`
      );
    }

    // Read Vec<Ix> after the transfer
    const ixs = await deserializeIxs(reader);

    return { type: "Transfer", transfer, ixs } as const;
  }

  throw new Error(`Unknown discriminator: ${messageDiscriminator}`);
}

async function deserializeIxs(reader: BufferReader) {
  // Read Vec length (4 bytes)
  const ixsLength = reader.readUInt32LE();

  // Read instructions
  const ixs = [];
  for (let i = 0; i < ixsLength; i++) {
    const ix = await deserializeIx(reader);
    ixs.push(ix);
  }

  return ixs;
}

async function deserializeIx(reader: BufferReader) {
  // Read program_id (32 bytes)
  const programAddress = reader.readAddress();

  // Read accounts Vec length (4 bytes)
  const accountsLength = reader.readUInt32LE();

  // Read accounts
  const accounts = [];
  for (let i = 0; i < accountsLength; i++) {
    const account = await deserializeIxAccount(reader);
    accounts.push(account);
  }

  // Read data Vec length (4 bytes)
  const dataLength = reader.readUInt32LE();

  // Read data
  const data = reader.readBytes(dataLength);

  return { programAddress, accounts, data };
}

async function deserializeIxAccount(reader: BufferReader) {
  const address = await deserializeAddressOrPda(reader);

  const isWritable = reader.readUInt8() === 1;
  const isSigner = reader.readUInt8() === 1;

  return { address, isWritable, isSigner };
}

async function deserializeAddressOrPda(reader: BufferReader) {
  const discriminator = reader.readUInt8();

  // Pubkey variant
  if (discriminator === 0) {
    return reader.readAddress();
  }
  // PDA variant
  else if (discriminator === 1) {
    const seedsLength = reader.readUInt32LE();

    const seeds: Buffer[] = [];
    for (let i = 0; i < seedsLength; i++) {
      const seedLength = reader.readUInt32LE();
      const seed = reader.readBytes(seedLength);
      seeds.push(seed);
    }

    const programAddress = reader.readAddress();

    // Derive the PDA
    const [address] = await getProgramDerivedAddress({
      seeds,
      programAddress,
    });
    return address;
  }

  throw new Error(`Unknown PubkeyOrPda discriminator: ${discriminator}`);
}
