import React from "react";
import AppHeader from "../../../header/AppHeader";
import WithAppBar from "../../../layout/WithAppBar";
import { GlobalStateType } from "../../../store/reducer";
import { connect, MapDispatchToProps } from "react-redux";
import { hideQrCodeScanner } from "../../../store/actions";
import * as dbAddressActions from "../../../db/action/address";
import * as wasm from "ergo-lib-wasm-browser";
import UnsignedTxView from "../../../components/display-tx/UnsignedTxView";
import { Container, Divider, Grid, ListItem, ListItemIcon, ListItemText } from "@material-ui/core";
import DisplayId from "../../../components/DisplayId";
import BottomSheet from "../../../components/bottom-sheet/BottomSheet";
import { Inbox } from "@material-ui/icons";
import node from "../../../network/node";
import { Browser } from "@capacitor/browser";
import { EXPLORER_FRONT_URL } from "../../../config/const";

interface PropsType {
    closeQrcode: () => any;
    tx: { signedTx: string }
}
interface stateType {
    tx?: wasm.Transaction;
    loading: boolean;
    loadedTx: string;
    addresses: Array<string>;
    txId?: string;
}

class TransactionPublishRequest extends React.Component<PropsType, stateType>{
    state: stateType = {
        loading: false,
        loadedTx: "",
        addresses: [],
    };
    _base64ToArrayBuffer = (base64: string): Uint8Array => {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        let bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes;
    };

    loadTx = () => {
        if (!this.state.loading && this.state.loadedTx !== this.props.tx.signedTx) {
            this.setState({ loading: true });
            // debugger
            const signedTx = this.props.tx.signedTx;
            dbAddressActions.getAllAddresses().then(addresses => {
                const txBytes = this._base64ToArrayBuffer(signedTx);
                const tx = wasm.Transaction.sigma_parse_bytes(txBytes);
                this.setState({
                    tx: tx,
                    loading: false,
                    loadedTx: signedTx,
                    addresses: addresses.map(item => item.address)
                })
            })
        }
    };

    componentDidMount() {
        this.loadTx();
    }

    componentDidUpdate(prevProps: Readonly<PropsType>, prevState: Readonly<stateType>, snapshot?: any) {
        this.loadTx();
    }

    sendTx = () => {
        if(this.state.tx) {
            node.sendTx(this.state.tx).then(result => {
                this.setState({txId: result.txId});
            }).catch(exp => {
                console.log(exp);
            });
        }
    }

    render = () => {
        const tx = this.state.tx;
        return (
            <WithAppBar
                header={<AppHeader hideQrCode={true} title="Signing transaction" back={this.props.closeQrcode} />}>
                {tx !== undefined ? (
                    <React.Fragment>
                        <UnsignedTxView
                            tx={tx}
                            boxes={[]}
                            addresses={this.state.addresses}>
                            <Divider/>
                            <ListItem button onClick={() => this.sendTx()}>
                                <ListItemIcon>
                                    <Inbox />
                                </ListItemIcon>
                                <ListItemText primary="Publish Transaction" />
                            </ListItem>
                        </UnsignedTxView>
                        <Divider />
                    </React.Fragment>
                ) : null}
                <BottomSheet show={!!this.state.txId} close={this.props.closeQrcode}>
                    <Container>
                        <Grid container spacing={2}>
                            <Grid item xs={12}>
                                <h3>Your transaction submitted to network.</h3>
                                <br />
                                <div
                                    onClick={() => Browser.open({ url: `${EXPLORER_FRONT_URL}/en/transactions/${this.state.txId}` })}>
                                    <DisplayId id={this.state.txId} />
                                </div>
                                <br />
                                It can take about 2 minutes to mine your transaction. also syncing your wallet may be slow
                                <br />
                                <br />
                                <br />
                                <br />
                                <br />
                            </Grid>
                        </Grid>
                    </Container>
                </BottomSheet>
            </WithAppBar>
        );
    };
}

const mapStateToProps = (state: GlobalStateType) => ({
    // scan: state.qrcode.chunks
});


const mapDispatchToProps = (dispatch: MapDispatchToProps<any, any>) => ({
    closeQrcode: () => dispatch(hideQrCodeScanner())
});

export default connect(mapStateToProps, mapDispatchToProps)(TransactionPublishRequest);