use color_eyre::Result;
use solana_client::{
    rpc_client::RpcClient, rpc_config::RpcRequestAirdropConfig, rpc_response::Response,
};
use solana_sdk::{
    commitment_config::CommitmentConfig, program_pack::Pack, pubkey::Pubkey, signature::Keypair,
    signer::Signer, system_instruction, transaction::Transaction,
};
use spl_token::{
    instruction::{initialize_account, initialize_mint},
    state::{Account as TokenAccount, Mint},
};
use tracing::{error, info, info_span, warn, Instrument};
use tracing_subscriber::FmtSubscriber;
use yellowstone_vixen_proto::{
    prost::Message,
    stream::{program_streams_client::ProgramStreamsClient, SubscribeRequest},
};

const GRPC_SERVER_ADDR: &str = "http://localhost:9000";
const VALIDATOR_RPC_ADDR: &str = "http://localhost:8899";
const TOKEN_PROGRAM: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

#[tokio::main]
async fn main() -> Result<()> {
    color_eyre::install()?;
    let subscriber = FmtSubscriber::builder().finish();
    tracing::subscriber::set_global_default(subscriber)?;

    let jid = tokio::spawn(async {
        let span = info_span!("Mint Token");
        let res = airdrop_and_mint_token().instrument(span).await;
        if let Err(_e) = res {
            error!("Error airdropping or minting token");
        }
    });

    let span = info_span!("Vixen streaming client");
    let mut client = ProgramStreamsClient::connect(GRPC_SERVER_ADDR).await?;
    let req = SubscribeRequest {
        program: TOKEN_PROGRAM.to_string(),
    };
    let mut stream = client.subscribe(req).await?.into_inner();
    info!("Connected to Vixen gRPC server");
    while let Some(update) = stream.message().await? {
        let any = update.parsed.unwrap();
        if let Ok(parsed_message) =
            yellowstone_vixen_proto::parser::TokenProgramIxProto::decode(&*any.value)
        {
            let val = parsed_message.ix_oneof.unwrap();
            info!("Parsed message: {:?}", val);
        }
        // else {
        //     warn!("Failed to parse TokenProgramIxProto message {:?}", any);
        // }
    }

    // let _span = info_span!("Vixen Client").entered();
    jid.await?;

    Ok(())
}

async fn airdrop_and_mint_token() -> Result<()> {
    // TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
    let kp = Keypair::new();
    info!("Public key: {}", kp.pubkey());
    // Fund the Keypair
    let rpc_client = RpcClient::new(VALIDATOR_RPC_ADDR);
    airdrop_new_address(kp.pubkey(), &rpc_client).await?;
    // Create a new keypair for the mint
    let mint_keypair = Keypair::new();
    create_mint(&mint_keypair, &kp, &rpc_client).await?;
    let (pk1, pk2) = create_token_accounts(&rpc_client, &kp, &mint_keypair.pubkey())?;
    info!("Token Account 1 created: {}", pk1);
    info!("Token Account 2 created: {}", pk2);

    mint_to(
        &rpc_client,
        &kp,
        &mint_keypair.pubkey(),
        &pk1,
        10_000_000_000,
    )?;

    let balance = fetch_token_balance(&rpc_client, &pk1)?;
    info!("Token Account 1 balance: {}", balance);
    let balance2 = fetch_token_balance(&rpc_client, &pk2)?;
    info!("Token Account 2 balance: {}", balance2);

    Ok(())
}

async fn airdrop_new_address(pubkey: Pubkey, rpc_client: &RpcClient) -> Result<()> {
    let signature = rpc_client.request_airdrop_with_config(
        &pubkey,
        1_000_000_000,
        RpcRequestAirdropConfig {
            recent_blockhash: None,
            commitment: Some(CommitmentConfig::finalized()),
        },
    )?;
    let mut res: Response<bool> = rpc_client
        .confirm_transaction_with_commitment(&signature, CommitmentConfig::finalized())?;
    while !res.value {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        res = rpc_client
            .confirm_transaction_with_commitment(&signature, CommitmentConfig::finalized())?;
    }
    Ok(())
}

async fn create_mint(mint_keypair: &Keypair, kp: &Keypair, rpc_client: &RpcClient) -> Result<()> {
    let mint_pubkey = mint_keypair.pubkey();
    let decimals = 6; // e.g., 6 decimal places like USDC

    // Calculate minimum balance for rent exemption
    let rent = rpc_client.get_minimum_balance_for_rent_exemption(Mint::LEN)?;
    info!("Mint Address {}", mint_keypair.pubkey());
    // Create the mint account
    let create_account_ix = system_instruction::create_account(
        &kp.pubkey(),
        &mint_pubkey,
        rent,
        Mint::LEN as u64,
        &spl_token::id(),
    );

    // Initialize the mint
    let initialize_mint_ix = initialize_mint(
        &spl_token::id(),
        &mint_pubkey,
        &kp.pubkey(), // Mint authority
        None,         // Optional freeze authority
        decimals,
    )?;

    // Build and send the transaction
    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[create_account_ix, initialize_mint_ix],
        Some(&kp.pubkey()),
        &[&kp, &mint_keypair],
        recent_blockhash,
    );
    let signature = rpc_client.send_and_confirm_transaction(&tx)?;
    info!("Mint created with signature: {}", signature);
    Ok(())
}

// Create two token accounts for the mint
fn create_token_accounts(
    client: &RpcClient,
    payer: &Keypair,
    mint_pubkey: &Pubkey,
) -> Result<(Pubkey, Pubkey)> {
    // Create two new keypairs for the token accounts
    let token_account1 = Keypair::new();
    let token_account2 = Keypair::new();

    // Get minimum balance for rent exemption
    let rent = client.get_minimum_balance_for_rent_exemption(TokenAccount::LEN)?;

    // Create account instructions
    let create_account1_ix = system_instruction::create_account(
        &payer.pubkey(),
        &token_account1.pubkey(),
        rent,
        TokenAccount::LEN as u64,
        &spl_token::id(),
    );

    let create_account2_ix = system_instruction::create_account(
        &payer.pubkey(),
        &token_account2.pubkey(),
        rent,
        TokenAccount::LEN as u64,
        &spl_token::id(),
    );

    // Initialize token account instructions
    let init_account1_ix = initialize_account(
        &spl_token::id(),
        &token_account1.pubkey(),
        mint_pubkey,
        &payer.pubkey(), // Using payer as owner for simplicity
    )?;

    let init_account2_ix = initialize_account(
        &spl_token::id(),
        &token_account2.pubkey(),
        mint_pubkey,
        &payer.pubkey(), // Using payer as owner for simplicity
    )?;

    // Create and sign transaction
    let recent_blockhash = client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[
            create_account1_ix,
            init_account1_ix,
            create_account2_ix,
            init_account2_ix,
        ],
        Some(&payer.pubkey()),
        &[payer, &token_account1, &token_account2],
        recent_blockhash,
    );

    // Send and confirm transaction
    let signature = client.send_and_confirm_transaction(&tx)?;
    info!(
        "Transaction signature for 2 token account creations: {}",
        signature
    );

    Ok((token_account1.pubkey(), token_account2.pubkey()))
}

fn mint_to(
    client: &RpcClient,
    payer: &Keypair,
    mint_pubkey: &Pubkey,
    token_account_pubkey: &Pubkey,
    amount: u64,
) -> Result<()> {
    // Create the mint_to instruction
    let mint_to_ix = spl_token::instruction::mint_to(
        &spl_token::id(),
        mint_pubkey,
        token_account_pubkey,
        &payer.pubkey(), // Using payer as authority for simplicity
        &[],
        amount,
    )?;

    // Create and sign the transaction
    let recent_blockhash = client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[mint_to_ix],
        Some(&payer.pubkey()),
        &[payer],
        recent_blockhash,
    );

    // Send and confirm the transaction
    let signature = client.send_and_confirm_transaction(&tx)?;
    info!(
        "Minted {} tokens to account {} with signature {}",
        amount, token_account_pubkey, signature
    );

    Ok(())
}

fn fetch_token_balance(client: &RpcClient, token_account_pubkey: &Pubkey) -> Result<u64> {
    let account_info = client.get_account(token_account_pubkey)?;
    let token_account = TokenAccount::unpack(&account_info.data)?;
    Ok(token_account.amount)
}
