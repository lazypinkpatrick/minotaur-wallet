import React from "react";
import { Avatar, Badge, ListItem, ListItemAvatar, ListItemText } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { faCoffee, faWallet } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { deepOrange, deepPurple } from '@mui/material/colors';
import { WalletType } from "../../db/entities/Wallet";
import { getRoute, RouteMap } from "../route/routerMap";
import { getNetworkType } from "../../util/network_type";
import Erg from "../value/Erg";



interface WalletListElementPropType {
    type: WalletType;
    id: number;
    name: string;
    erg: bigint;
    tokens: number;
    network_type: string;
    onClick?: () => any
}

const WalletElement = (props: WalletListElementPropType) => {
    const navigate = useNavigate()
    const gotoWallet = () => {
        if(props.onClick){
            props.onClick()
        }else {
            navigate(getRoute(RouteMap.WalletTransaction, {"id": props.id}));
        }
    };
    const network_type = getNetworkType(props.network_type);
    return (
        <ListItem onClick={gotoWallet}>
            <ListItemAvatar>
                <Avatar sx={network_type.color === "orange" ? {bgColor: deepOrange[500]} : network_type.color === "purple" ? {bgColor: deepPurple[500]} : {}}>
                    {props.type === WalletType.Normal ? <FontAwesomeIcon icon={faWallet} /> : null}
                    {props.type === WalletType.ReadOnly ? <FontAwesomeIcon icon={faCoffee} /> : null}
                </Avatar>
            </ListItemAvatar>
            <ListItemText
                primary={props.name}
                secondary={(
                    <React.Fragment>
                        <Erg erg={props.erg} showUnit={true} network_type={props.network_type} />
                        <span style={{ float: "right", marginRight: 10 }}>
                            {props.tokens ? <Badge badgeContent={"+" + props.tokens} color="primary" /> : ""}
                        </span>
                    </React.Fragment>
                )}
            />
        </ListItem>
    );
};

export default WalletElement;
