import React, { Component } from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import classnames from 'classnames';
import { Icon, Dropdown, Menu, Modal } from 'antd';
import scrollIntoView from 'dom-scroll-into-view';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import history from '../../common/history';
import { SvgIcon } from '../common';
import { closeTab, stickTab, moveTab } from './redux/actions';
import { tabsSelector } from './selectors/tabs';
import editorStateMap from '../editor/editorStateMap';
import modelManager from '../editor/modelManager';

const getListStyle = () => ({
  display: 'flex',
  padding: 0,
  overflow: 'auto',
});

export class TabsBar extends Component {
  static propTypes = {
    openTabs: PropTypes.array.isRequired,
    historyTabs: PropTypes.array.isRequired,
    actions: PropTypes.object.isRequired,
    dispatch: PropTypes.func.isRequired,
    location: PropTypes.object.isRequired,
    viewChanged: PropTypes.object.isRequired,
    elementById: PropTypes.object.isRequired,
  };

  constructor(props) {
    super(props);
    console.log('tabs bar constructor');
  }

  componentDidUpdate(prevProps) {
    if (prevProps.location.pathname !== this.props.location.pathname) {
      if (this.delayScroll) clearTimeout(this.delayScroll);
      this.delayScroll = setTimeout(this.scrollActiveTabIntoView, 100);
    }

    if (prevProps.elementById !== this.props.elementById) {
      this.closeNotExistingTabs();
    }
  }

  closeNotExistingTabs() {
    const { openTabs, historyTabs, elementById } = this.props;
    const newOpenTabs = [...openTabs];
    const newHistoryTabs = [...historyTabs];
    let needRedirect = false;
    newOpenTabs.forEach(tab => {
      if (!elementById[tab.key] && /^\/element\//.test(tab.urlPath)) {
        if (tab.isActive) needRedirect = true;
        this.props.actions.closeTab(tab.key);
        _.pull(newHistoryTabs, tab.key);
      }
    });
    if (needRedirect) {
      if (newHistoryTabs.length === 0) {
        history.push('/welcome');
      } else {
        const nextKey = newHistoryTabs[0];
        const tab = _.find(newOpenTabs, { key: nextKey });
        if (tab) history.push(tab.urlPath);
      }
    }
  }

  getCurrentTab() {
    return _.find(this.props.openTabs, t => t.isActive);
  }

  isChanged(tab) {
    if (tab.subTabs && tab.subTabs.length) return tab.subTabs.some(this.isSubTabChanged);
    return this.props.viewChanged[tab.urlPath];
  }

  isSubTabChanged = subTab => this.props.viewChanged[subTab.urlPath];

  scrollActiveTabIntoView = () => {
    delete this.delayScroll;
    if (!this.rootNode) return;
    const node = this.rootNode.querySelector('.tab.is-active');
    if (node) {
      scrollIntoView(node, this.rootNode, {
        allowHorizontalScroll: true,
        onlyScrollIfNeeded: true,
        offsetRight: 100,
        offsetLeft: 100,
      });
    }
    this.rootNode.scrollTop = 0; // Prevent vertical offset when switching tabs.
  };

  handleSelectTab = tab => {
    if (this.props.location.pathname !== tab.urlPath) history.push(tab.urlPath);
  };

  handleSelectSubTab = subTab => {
    if (this.props.location.pathname !== subTab.urlPath) history.push(subTab.urlPath);
  };

  handleClose = (evt, tab, force) => {
    if (evt && evt.stopPropagation) evt.stopPropagation();

    const { openTabs, historyTabs } = this.props;

    const doClose = () => {
      const ele = this.props.elementById[tab.key];
      if (ele) {
        const files = [];
        if (ele.type === 'file') files.push(ele.id);
        else if (ele.target) files.push(ele.target);
        if (ele.views) {
          files.push.apply(files, ele.views.map(v => v.target));
        }
        files.forEach(file => {
          if (!file) return;
          // TODO: this may not cover all posibilities for files under a tab
          delete editorStateMap[file];
          modelManager.reset(file);
        });
      }

      this.props.actions.closeTab(tab.key);
      if (historyTabs.length === 1) {
        history.push('/welcome');
      } else if (tab.isActive) {
        // Close the current one
        const nextKey = historyTabs[1]; // at this point the props has not been updated.
        const tab = _.find(openTabs, { key: nextKey });
        history.push(tab.urlPath);
      }
    };

    if (!force && this.isChanged(tab)) {
      Modal.confirm({
        title: 'Discard changes?',
        content: `Do you want to discard changes you made to ${tab.name}?`,
        okText: 'Discard',
        onOk: () => {
          doClose();
        },
        onCancel: () => {},
      });
    } else {
      doClose();
    }
  };

  handleDragEnd = result => {
    this.props.actions.moveTab(result);
  };

  handleMenuClick = (tab, menuKey) => {
    const { openTabs } = this.props;
    switch (menuKey) {
      case 'close-others':
        openTabs.filter(t => t.key !== tab.key).forEach(t => this.handleClose({}, t));
        break;
      case 'close-right':
        openTabs
          .slice(_.findIndex(openTabs, { key: tab.key }) + 1)
          .forEach(t => this.handleClose({}, t));
        break;
      case 'close-self':
        this.handleClose({}, tab);
        break;
      default:
        break;
    }
  };

  assignRef = node => {
    this.rootNode = node;
  };

  renderSubTabs = () => {
    const { pathname } = this.props.location;
    const currentTab = this.getCurrentTab();
    const hasSubTabs = currentTab && currentTab.subTabs && currentTab.subTabs.length > 0;
    if (!hasSubTabs) return null;
    let activeSubTabPath = pathname;
    if (!currentTab.subTabs.some(t => t.urlPath === pathname)) {
      const st = _.find(currentTab.subTabs, 'isDefault');
      if (st) activeSubTabPath = st.urlPath;
    }

    return (
      <div className="sub-tabs">
        {currentTab.subTabs.map(subTab => (
          <span
            key={subTab.key}
            className={classnames('sub-tab', {
              'is-active': activeSubTabPath === subTab.urlPath,
              'is-changed': this.isSubTabChanged(subTab),
            })}
            onClick={() => this.handleSelectSubTab(subTab)}
          >
            {subTab.name}
            {this.isSubTabChanged(subTab) ? <span style={{ color: '#108ee9' }}> *</span> : null}
          </span>
        ))}
      </div>
    );
  };

  renderTab = (tab, index) => {
    const getMenu = tab => (
      <Menu onClick={args => this.handleMenuClick(tab, args.key)}>
        <Menu.Item key="close-others">Close others</Menu.Item>
        <Menu.Item key="close-right">Close to the right</Menu.Item>
        <Menu.Item key="close-self">Close</Menu.Item>
      </Menu>
    );
    const iconStyle = tab.iconColor ? { fill: tab.iconColor } : null;
    return (
      <Draggable key={tab.key} draggableId={tab.key} index={index}>
        {provided => (
          <Dropdown overlay={getMenu(tab)} trigger={['contextMenu']} key={tab.key}>
            <span
              key={tab.key}
              onClick={() => this.handleSelectTab(tab)}
              onDoubleClick={() => this.props.actions.stickTab(tab.key)}
              ref={provided.innerRef}
              {...provided.draggableProps}
              {...provided.dragHandleProps}
              className={classnames('tab', {
                'is-active': tab.isActive,
                'is-changed': this.isChanged(tab),
                'is-temp': tab.isTemp,
              })}
            >
              {tab.icon && <SvgIcon type={tab.icon} style={iconStyle} />}
              <label>{tab.name}</label>
              <Icon type="close" onClick={evt => this.handleClose(evt, tab)} />
            </span>
          </Dropdown>
        )}
      </Draggable>
    );
  };

  renderNoThing() {
    return null;
  }

  render() {
    const { openTabs } = this.props;
    if (!openTabs.length) {
      return this.renderNoThing();
    }
    const currentTab = this.getCurrentTab();
    const hasSubTabs = currentTab && currentTab.subTabs && currentTab.subTabs.length > 0;
    return (
      <div className={classnames('home-tabs-bar', { 'has-sub-tabs': hasSubTabs })}>
        <DragDropContext onDragEnd={this.handleDragEnd}>
          <Droppable droppableId="droppable" direction="horizontal">
            {provided => (
              <div
                className="main-tabs"
                ref={node => {
                  this.assignRef(node);
                  provided.innerRef(node);
                }}
                style={{ ...getListStyle() }}
              >
                {openTabs.map(this.renderTab)}
              </div>
            )}
          </Droppable>
        </DragDropContext>
        {this.renderSubTabs()}
      </div>
    );
  }
}

/* istanbul ignore next */
function mapStateToProps(state) {
  return {
    ..._.pick(state.home, ['openTabs', 'projectRoot', 'historyTabs', 'viewChanged', 'elementById']),
    tabs: tabsSelector(state),
    location: state.router.location,
  };
}

/* istanbul ignore next */
function mapDispatchToProps(dispatch) {
  return {
    actions: bindActionCreators({ closeTab, stickTab, moveTab }, dispatch),
    dispatch,
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(TabsBar);
