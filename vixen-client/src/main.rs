use color_eyre::Result;
use solana_client::{
    rpc_client::RpcClient, rpc_config::RpcRequestAirdropConfig, rpc_response::Response,
};
use solana_sdk::{
    commitment_config::CommitmentConfig, program_pack::Pack, pubkey::Pubkey, signature::Keypair,
    signer::Signer, system_instruction, transaction::Transaction,
};
use spl_token::{instruction::initialize_mint, state::Mint};
use tracing::{error, info, info_span, Instrument};
use tracing_subscriber::FmtSubscriber;
use yellowstone_vixen_proto::stream::{
    program_streams_client::ProgramStreamsClient, SubscribeRequest,
};

const GRPC_SERVER_ADDR: &str = "http://localhost:8899";
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
    while let Some(update) = stream.message().await? {
        info!("Received update: {:?}", update);
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
    let rpc_client = RpcClient::new("http://localhost:8899");
    airdrop_new_address(kp.pubkey(), &rpc_client).await?;
    // Create a new keypair for the mint
    let mint_keypair = Keypair::new();
    create_mint(&mint_keypair, &kp, &rpc_client).await?;

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
